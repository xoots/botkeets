import { type TokenUsage } from './routing-logger.js';
export type LlmProvider = 'ollama' | 'claude' | 'anthropic' | 'openrouter' | 'dashscope' | 'deepseek';
export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface LlmRoute {
    provider: LlmProvider;
    model: string;
    timeoutMs?: number;
    temperature?: number;
    maxTokens?: number;
    numPredict?: number;
    think?: boolean;
    preflightAvailability?: boolean;
}
export interface RunLlmOptions {
    messages: LlmMessage[];
    routes: LlmRoute[];
    workspaceDir?: string;
    settingSources?: Array<'project' | 'user' | 'local'>;
    caller?: string;
    dedupeProviderFailures?: boolean;
    onRouteFailure?: (attempt: {
        route: LlmRoute;
        error: string;
        isRateLimit: boolean;
        skipped: boolean;
    }) => void;
}
export interface RunLlmResult {
    text: string;
    provider: LlmProvider;
    model: string;
    usedFallback: boolean;
    usage: TokenUsage;
    raw: unknown;
}
export declare class AllLlmRoutesFailedError extends Error {
    readonly attempts: Array<{
        provider: LlmProvider;
        model: string;
        error: string;
        skipped: boolean;
    }>;
    constructor(attempts: Array<{
        provider: LlmProvider;
        model: string;
        error: string;
        skipped: boolean;
    }>);
}
export declare function stripMarkdownCodeFences(text: string): string;
export declare function runLlm(options: RunLlmOptions): Promise<RunLlmResult>;
//# sourceMappingURL=llm-router.d.ts.map