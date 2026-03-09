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
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    /** USD cost — 0.0 for local Ollama calls */
    usdCost: number;
}
export interface RoutingLogEntry {
    ts: string;
    chatJid: string;
    intent: string;
    mode: string;
    modeOverride: boolean;
    provider: string;
    model: string;
    /** Always 1 per entry. Sum across entries for dashboard-style request counts. */
    requestCount: 1;
    inputTokens: number;
    outputTokens: number;
    usdCost: number;
    latencyMs: number;
    success: boolean;
    /** True if the primary provider failed and a fallback was used. */
    fallback: boolean;
    lane_used?: 'copaw_orchestrator' | 'keet_execution';
    fallback_reason?: string;
    note?: string;
}
export interface SpendStats {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalUsdCost: number;
    byProvider: Record<string, {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        usdCost: number;
    }>;
    byModel: Record<string, {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        usdCost: number;
    }>;
    byLane: Record<string, number>;
}
/**
 * Append a routing decision to today's JSONL log.
 * Fire-and-forget — errors are swallowed so logging never stalls the hot path.
 */
export declare function logRoutingDecision(entry: Omit<RoutingLogEntry, 'ts' | 'requestCount'>): void;
export declare function readTodayLogs(): RoutingLogEntry[];
export declare function readRecentLogs(days?: number): RoutingLogEntry[];
/**
 * Compute aggregated spend stats from a set of log entries.
 * Mirrors the three OpenRouter dashboard columns: requests / tokens / cost.
 */
export declare function aggregateSpend(entries: RoutingLogEntry[]): SpendStats;
/**
 * Format a spend summary as a human-readable string for status messages.
 */
export declare function formatSpendSummary(stats: SpendStats): string;
/**
 * Extract token usage from an Anthropic API response body.
 * Anthropic returns: { usage: { input_tokens, output_tokens } }
 */
export declare function extractAnthropicUsage(body: {
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
    };
}, pricePerInputToken: number, pricePerOutputToken: number): TokenUsage;
/**
 * Extract token usage from an OpenRouter / OpenAI-compatible response body.
 * Returns: { usage: { prompt_tokens, completion_tokens } }
 */
export declare function extractOpenRouterUsage(body: {
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}, pricePerInputToken: number, pricePerOutputToken: number): TokenUsage;
/**
 * Extract token usage from an Ollama response body.
 * Ollama returns: { prompt_eval_count, eval_count } — local so cost = 0.
 */
export declare function extractOllamaUsage(body: {
    prompt_eval_count?: number;
    eval_count?: number;
}): TokenUsage;
//# sourceMappingURL=routing-logger.d.ts.map