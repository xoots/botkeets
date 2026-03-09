export interface MessageLike {
    role: 'user' | 'assistant';
    content: string;
}
export interface ContextBudget {
    estimatedTokens: number;
    limitTokens: number;
    usedPercent: number;
    overBudget: boolean;
    hardStopExceeded: boolean;
}
export interface SessionStateSnapshot {
    session_id: string;
    context_usage_tokens: number;
    compaction_count: number;
    anchor_cap_remaining: number;
    found: boolean;
}
export declare function estimateTokens(text: string): number;
export declare function estimateMessagesTokens(messages: MessageLike[]): number;
export declare function getSessionStateFromHistory(sessionId: string, historyPath: string, anchorTokens: number, model: string): SessionStateSnapshot;
export declare function getContextLimit(model: string): number;
/**
 * Check whether a message array is approaching the model's context limit.
 * Returns budget info. Caller decides whether to compress.
 */
export declare function checkContextBudget(messages: MessageLike[], model: string): ContextBudget;
/**
 * Compress a message array by collapsing old turns to one-liners.
 * Keeps the last RECENT_TURNS_UNCOMPRESSED messages intact — SWE-Agent pattern.
 * Uses qwen3:8b locally (free, fast) for summarisation.
 *
 * @param messages   Full message history
 * @returns          Compressed message array
 */
export declare function compressMessages(messages: MessageLike[]): Promise<MessageLike[]>;
/**
 * Gate function — call this before every model invocation.
 * Checks budget, compresses if needed, returns the (possibly compressed) messages.
 *
 * @param messages   Current message array
 * @param model      Model string (used to look up context limit)
 * @returns          Safe message array ready for model call
 */
export declare function prepareMessages(messages: MessageLike[], model: string): Promise<MessageLike[]>;
export declare function prepareContext(prompt: string, model: string): Promise<string>;
//# sourceMappingURL=context-manager.d.ts.map