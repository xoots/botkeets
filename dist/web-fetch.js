/**
 * Web Fetch
 *
 * Fetches a URL and extracts clean readable text using a lightweight
 * readability algorithm — same approach as nanobot's WebFetchTool.
 *
 * Strategy:
 *   1. Fetch raw HTML with a browser-like User-Agent
 *   2. Strip script/style/nav/footer/form elements
 *   3. Extract main content text
 *   4. Truncate to maxChars to avoid blowing LLM context windows
 *
 * This runs inside the host process (not a container) so it must be fast
 * and have a strict timeout. For full headless browser interaction, use
 * the agent-browser tool inside a container instead.
 */
import { logger } from './logger.js';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 8_000;
// Tags whose content we fully strip (they don't contain readable text)
const STRIP_TAGS = [
    'script', 'style', 'noscript', 'nav', 'footer', 'header',
    'aside', 'form', 'button', 'input', 'select', 'textarea',
    'svg', 'canvas', 'iframe', 'embed', 'object',
];
/**
 * Very lightweight HTML → plain text extractor.
 * Does NOT require a DOM parser — works on raw HTML strings via regex.
 * Good enough for article/documentation content.
 */
function htmlToText(html) {
    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    // Strip full tags with content
    let stripped = html;
    for (const tag of STRIP_TAGS) {
        const re = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi');
        stripped = stripped.replace(re, ' ');
    }
    // Strip remaining HTML tags
    stripped = stripped.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    stripped = stripped
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
    // Collapse whitespace
    stripped = stripped.replace(/\s+/g, ' ').trim();
    return { title, text: stripped };
}
/**
 * Fetch a URL and return its clean text content.
 *
 * @param url       Target URL
 * @param maxChars  Maximum characters to return (default 8000)
 * @param timeoutMs Request timeout in ms (default 15000)
 */
export async function fetchPage(url, maxChars = DEFAULT_MAX_CHARS, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        }
        const contentType = resp.headers.get('content-type') ?? '';
        let text;
        let title = '';
        if (contentType.includes('text/html')) {
            const html = await resp.text();
            const parsed = htmlToText(html);
            title = parsed.title;
            text = parsed.text;
        }
        else {
            // Plain text / markdown / JSON — return as-is
            text = await resp.text();
        }
        const truncated = text.length > maxChars;
        const content = truncated ? text.slice(0, maxChars) + '\n…[truncated]' : text;
        logger.debug({ url, chars: content.length, truncated }, 'Web fetch complete');
        return { url, title, content, truncated };
    }
    catch (err) {
        clearTimeout(timeoutId);
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ url, err: message }, 'Web fetch failed');
        // Return empty rather than throwing — agent continues with what it has
        return { url, title: '', content: `[Failed to fetch ${url}: ${message}]`, truncated: false };
    }
}
/**
 * Format a FetchedPage for injection into an LLM prompt.
 */
export function formatFetchedPage(page) {
    const lines = [`[Web page: ${page.url}]`];
    if (page.title)
        lines.push(`Title: ${page.title}`);
    lines.push('', page.content);
    return lines.join('\n');
}
//# sourceMappingURL=web-fetch.js.map