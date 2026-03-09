export interface InteractionStoreRecord {
    id: number;
    ts: string;
    provider: string;
    model: string;
    caller: string;
    prompt_preview: string;
    response_preview: string;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
    duration_ms: number;
    success: boolean;
    error: string | null;
}
export interface InteractionRecordInput {
    ts?: string;
    provider: string;
    model: string;
    caller: string;
    promptPreview: string;
    responsePreview?: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    durationMs: number;
    success: boolean;
    error?: string | null;
}
export interface InteractionQueryOptions {
    limit?: number;
    provider?: string;
    caller?: string;
    success?: boolean;
}
export declare function sanitizeInteractionPreview(text: string, maxChars?: number): string;
export declare function sanitizeInteractionError(text: string): string;
export declare function formatInteractionPrompt(messages: Array<{
    role: string;
    content: string;
}>): string;
export declare function inferInteractionCaller(projectRoot?: string): string;
export declare function recordInteraction(input: InteractionRecordInput): void;
export declare function listInteractions(options?: InteractionQueryOptions): InteractionStoreRecord[];
export declare function getInteractionCount(): number;
export declare function setInteractionStorePathForTests(nextPath: string | null): void;
export declare function resetInteractionStoreForTests(): void;
//# sourceMappingURL=interaction-store.d.ts.map