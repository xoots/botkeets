export interface ClaudeTextPromptOptions {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    workspaceDir: string;
    timeoutMs?: number;
    settingSources?: Array<'project' | 'user' | 'local'>;
}
interface ClaudeSdkMessage {
    type: string;
    subtype?: string;
    result?: string;
    error?: string;
}
interface ClaudeSdkQuery {
    [Symbol.asyncIterator](): AsyncIterator<ClaudeSdkMessage>;
    close?: () => void;
}
interface ClaudeSdkModule {
    query(params: {
        prompt: string;
        options?: Record<string, unknown>;
    }): ClaudeSdkQuery;
}
export declare function loadClaudeAgentSdk(): Promise<ClaudeSdkModule>;
export declare function executeClaudeTextPrompt(opts: ClaudeTextPromptOptions): Promise<string>;
export declare function resetClaudeTextExecutorForTests(): void;
export declare function setClaudeAgentSdkLoaderForTests(loader: () => Promise<ClaudeSdkModule>): void;
export {};
//# sourceMappingURL=claude-text-executor.d.ts.map