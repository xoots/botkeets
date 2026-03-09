/**
 * Routing Logger
 *
 * Records every routing decision as a JSONL entry so the self-improvement
 * loop can learn which routes work well and which waste tokens or fail.
 *
 * Log location: <projectRoot>/logs/routing-YYYY-MM-DD.jsonl
 *
 * Each entry matches the three core OpenRouter dashboard metrics
 * (requests, tokens, cost) plus our routing-specific fields:
 *
 * {
 *   ts:            ISO timestamp
 *   chatJid:       group/channel identifier
 *   intent:        classified intent
 *   mode:          active mode at decision time
 *   modeOverride:  true if an inline !tag was used
 *   provider:      chosen provider ('ollama' | 'claude' | 'openrouter' | 'perplexity')
 *   model:         specific model used
 *   requestCount:  always 1 per entry; aggregate for dashboard parity
 *   inputTokens:   prompt tokens from API response (or estimate for Ollama)
 *   outputTokens:  completion tokens from API response
 *   usdCost:       calculated cost in USD (0 for local models)
 *   latencyMs:     wall-clock ms from message receipt to reply sent
 *   success:       did the call succeed without error?
 *   fallback:      was a fallback provider used (primary failed)?
 *   note:          optional free-text observation (classifier reasoning etc.)
 * }
 */
import fs from 'fs';
import path from 'path';
const PROJECT_ROOT = process.cwd();
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
// ── I/O ───────────────────────────────────────────────────────────────────────
function getLogPath(date) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return path.join(LOGS_DIR, `routing-${d}.jsonl`);
}
/**
 * Append a routing decision to today's JSONL log.
 * Fire-and-forget — errors are swallowed so logging never stalls the hot path.
 */
export function logRoutingDecision(entry) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
        const full = {
            ts: new Date().toISOString(),
            requestCount: 1,
            ...entry,
        };
        fs.appendFileSync(getLogPath(), JSON.stringify(full) + '\n', 'utf-8');
    }
    catch {
        // Never crash the agent
    }
}
/**
 * Parse a JSONL file into RoutingLogEntry array, skipping malformed lines.
 */
function parseLogFile(logPath) {
    try {
        const raw = fs.readFileSync(logPath, 'utf-8');
        return raw
            .trim()
            .split('\n')
            .filter(Boolean)
            .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            }
            catch {
                return [];
            }
        });
    }
    catch {
        return [];
    }
}
export function readTodayLogs() {
    return parseLogFile(getLogPath());
}
export function readRecentLogs(days = 7) {
    const entries = [];
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        entries.push(...parseLogFile(getLogPath(d.toISOString().slice(0, 10))));
    }
    return entries;
}
// ── Aggregation ───────────────────────────────────────────────────────────────
/**
 * Compute aggregated spend stats from a set of log entries.
 * Mirrors the three OpenRouter dashboard columns: requests / tokens / cost.
 */
export function aggregateSpend(entries) {
    const stats = {
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalUsdCost: 0,
        byProvider: {},
        byModel: {},
        byLane: {},
    };
    for (const e of entries) {
        stats.totalRequests += 1;
        stats.totalInputTokens += e.inputTokens ?? 0;
        stats.totalOutputTokens += e.outputTokens ?? 0;
        stats.totalUsdCost += e.usdCost ?? 0;
        for (const [key, bucket] of [[e.provider, stats.byProvider], [e.model, stats.byModel]]) {
            if (!bucket[key])
                bucket[key] = { requests: 0, inputTokens: 0, outputTokens: 0, usdCost: 0 };
            bucket[key].requests += 1;
            bucket[key].inputTokens += e.inputTokens ?? 0;
            bucket[key].outputTokens += e.outputTokens ?? 0;
            bucket[key].usdCost += e.usdCost ?? 0;
        }
        if (e.lane_used)
            stats.byLane[e.lane_used] = (stats.byLane[e.lane_used] ?? 0) + 1;
    }
    return stats;
}
/**
 * Format a spend summary as a human-readable string for status messages.
 */
export function formatSpendSummary(stats) {
    const cost = stats.totalUsdCost.toFixed(4);
    const tokens = (stats.totalInputTokens + stats.totalOutputTokens).toLocaleString();
    return `${stats.totalRequests} requests · ${tokens} tokens · $${cost}`;
}
// ── Token extraction helpers (called by API wrappers) ────────────────────────
/**
 * Extract token usage from an Anthropic API response body.
 * Anthropic returns: { usage: { input_tokens, output_tokens } }
 */
export function extractAnthropicUsage(body, pricePerInputToken, pricePerOutputToken) {
    const inputTokens = body.usage?.input_tokens ?? 0;
    const outputTokens = body.usage?.output_tokens ?? 0;
    const usdCost = inputTokens * pricePerInputToken + outputTokens * pricePerOutputToken;
    return { inputTokens, outputTokens, usdCost };
}
/**
 * Extract token usage from an OpenRouter / OpenAI-compatible response body.
 * Returns: { usage: { prompt_tokens, completion_tokens } }
 */
export function extractOpenRouterUsage(body, pricePerInputToken, pricePerOutputToken) {
    const inputTokens = body.usage?.prompt_tokens ?? 0;
    const outputTokens = body.usage?.completion_tokens ?? 0;
    const usdCost = inputTokens * pricePerInputToken + outputTokens * pricePerOutputToken;
    return { inputTokens, outputTokens, usdCost };
}
/**
 * Extract token usage from an Ollama response body.
 * Ollama returns: { prompt_eval_count, eval_count } — local so cost = 0.
 */
export function extractOllamaUsage(body) {
    return {
        inputTokens: body.prompt_eval_count ?? 0,
        outputTokens: body.eval_count ?? 0,
        usdCost: 0, // local — always free
    };
}
//# sourceMappingURL=routing-logger.js.map