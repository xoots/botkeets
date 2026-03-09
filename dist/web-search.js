/**
 * Web Search
 *
 * Two-tier search strategy:
 *
 *   ECO / STANDARD (default)  → Brave Search API
 *     - Free tier: 2,000 queries/month
 *     - Returns: title, URL, snippet
 *     - Fast: ~200-400ms
 *
 *   PRO (high quality_stakes) → Perplexity API
 *     - Combines web search + LLM reasoning in one call
 *     - Returns a synthesised answer with citations
 *     - More expensive but eliminates a separate LLM call for research tasks
 *
 * The caller (mode-router / direct-runner) decides which tier to invoke
 * based on the ProviderPlan.needsWebSearch flag and the active mode.
 */
import { BRAVE_API_KEY, PERPLEXITY_API_KEY } from './config.js';
import { logger } from './logger.js';
// ── Brave Search ───────────────────────────────────────────────────────────────
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DDG_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/';
/**
 * Search via Brave API and return top results.
 * @param query   The search query string
 * @param count   Number of results (1-20, default 5)
 */
export async function braveSearch(query, count = 5) {
    if (!BRAVE_API_KEY) {
        throw new Error('BRAVE_API_KEY not configured');
    }
    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(count, 20)));
    url.searchParams.set('safesearch', 'moderate');
    url.searchParams.set('freshness', 'pw'); // past week for relevance
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
        const resp = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': BRAVE_API_KEY,
            },
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
            throw new Error(`Brave API error: ${resp.status} ${resp.statusText}`);
        }
        const data = (await resp.json());
        const raw = data?.web?.results ?? [];
        const results = raw.slice(0, count).map((r) => ({
            title: r.title || '',
            url: r.url || '',
            snippet: r.description || '',
        }));
        logger.debug({ query, count: results.length }, 'Brave search complete');
        return { query, results, provider: 'brave' };
    }
    catch (err) {
        clearTimeout(timeoutId);
        logger.error({ query, err }, 'Brave search failed');
        throw err;
    }
}
function decodeHtmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x2F;/g, '/');
}
function stripHtml(value) {
    return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .replace(/\s+([.,;:!?])/g, '$1');
}
function normalizeDuckDuckGoUrl(rawHref) {
    const href = decodeHtmlEntities(rawHref.trim());
    try {
        const url = new URL(href, DDG_HTML_ENDPOINT);
        const redirected = url.searchParams.get('uddg');
        if (redirected)
            return redirected;
        if (url.protocol === 'http:' || url.protocol === 'https:')
            return url.toString();
    }
    catch {
    }
    return href;
}
/**
 * Search DuckDuckGo's HTML endpoint as a last-resort fallback.
 * This is intentionally lightweight and only used when primary providers fail.
 */
export async function duckDuckGoHtmlSearch(query, count = 5) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
        const body = new URLSearchParams({
            q: query,
            kl: 'us-en',
        });
        const resp = await fetch(DDG_HTML_ENDPOINT, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html',
                'User-Agent': 'Mozilla/5.0 (compatible; NanoClaw/1.0; +https://nanoclaw.ai)',
            },
            body: body.toString(),
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
            throw new Error(`DuckDuckGo HTML error: ${resp.status} ${resp.statusText}`);
        }
        const html = await resp.text();
        const anchorPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const matches = Array.from(html.matchAll(anchorPattern));
        const results = matches.slice(0, count).map((match, index) => {
            const start = match.index ?? 0;
            const end = matches[index + 1]?.index ?? html.length;
            const chunk = html.slice(start, end);
            const snippetMatch = chunk.match(/<(?:a|div)[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
            return {
                title: stripHtml(match[2] || ''),
                url: normalizeDuckDuckGoUrl(match[1] || ''),
                snippet: stripHtml(snippetMatch?.[1] || ''),
            };
        }).filter((result) => result.title && result.url);
        logger.debug({ query, count: results.length }, 'DuckDuckGo HTML search complete');
        return { query, results, provider: 'duckduckgo' };
    }
    catch (err) {
        clearTimeout(timeoutId);
        logger.error({ query, err }, 'DuckDuckGo HTML search failed');
        throw err;
    }
}
// ── Perplexity Search ──────────────────────────────────────────────────────────
const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_MODEL = 'sonar-pro'; // search + reasoning in one call
/**
 * Search + synthesise via Perplexity API.
 * Returns a synthesised answer and the cited sources.
 * @param query  The search / question
 */
export async function perplexitySearch(query) {
    if (!PERPLEXITY_API_KEY) {
        throw new Error('PERPLEXITY_API_KEY not configured');
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
        const resp = await fetch(PERPLEXITY_ENDPOINT, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            },
            body: JSON.stringify({
                model: PERPLEXITY_MODEL,
                messages: [
                    { role: 'system', content: 'Be precise. Include key facts and cite sources.' },
                    { role: 'user', content: query },
                ],
                return_citations: true,
                return_images: false,
                max_tokens: 1024,
            }),
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
            throw new Error(`Perplexity API error: ${resp.status} ${resp.statusText}`);
        }
        const data = (await resp.json());
        const answer = data?.choices?.[0]?.message?.content?.trim() ?? '';
        const citations = data?.citations ?? [];
        // Convert citations (URLs) into SearchResult stubs
        const results = citations.slice(0, 5).map((url, i) => ({
            title: `Source ${i + 1}`,
            url,
            snippet: '',
        }));
        logger.debug({ query, citationCount: citations.length }, 'Perplexity search complete');
        return { query, results, answer, provider: 'perplexity' };
    }
    catch (err) {
        clearTimeout(timeoutId);
        logger.error({ query, err }, 'Perplexity search failed');
        throw err;
    }
}
// ── Unified entry ──────────────────────────────────────────────────────────────
/**
 * Run a web search using the best available provider.
 *
 * @param query     Search query
 * @param usePro    True → try Perplexity first; false → Brave only
 * @returns         SearchResponse with results (and optional synthesised answer)
 */
export async function webSearch(query, usePro = false) {
    const failures = [];
    if (usePro && PERPLEXITY_API_KEY) {
        try {
            return await perplexitySearch(query);
        }
        catch (err) {
            logger.warn({ err }, 'Perplexity failed — falling back to Brave');
            failures.push(`perplexity: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    else if (usePro) {
        failures.push('perplexity: not configured');
    }
    if (BRAVE_API_KEY) {
        try {
            return await braveSearch(query);
        }
        catch (err) {
            logger.warn({ err }, 'Brave failed — falling back to DuckDuckGo HTML');
            failures.push(`brave: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    else {
        failures.push('brave: not configured');
    }
    try {
        const fallback = await duckDuckGoHtmlSearch(query);
        if (failures.length === 0)
            return fallback;
        return {
            ...fallback,
            warning: `Primary search providers unavailable; used DuckDuckGo fallback (${failures.join('; ')})`,
        };
    }
    catch (err) {
        failures.push(`duckduckgo: ${err instanceof Error ? err.message : String(err)}`);
    }
    const warning = `All web search providers failed (${failures.join('; ')})`;
    logger.warn({ query, warning }, 'No web search provider available');
    return { query, results: [], provider: 'duckduckgo', warning };
}
/**
 * Format a SearchResponse into a compact string for injection into an LLM prompt.
 */
export function formatSearchResults(sr) {
    const lines = [];
    if (sr.answer) {
        lines.push(`[Search synthesis via ${sr.provider}]\n${sr.answer}`);
    }
    if (sr.results.length > 0) {
        lines.push('\n[Sources]');
        for (const r of sr.results) {
            lines.push(`• ${r.title}: ${r.url}`);
            if (r.snippet)
                lines.push(`  ${r.snippet}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=web-search.js.map