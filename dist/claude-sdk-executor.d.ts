import type { SandboxToolPolicyMode } from './types.js';
export interface ClaudeSdkPromptOptions {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    workspaceDir: string;
    groupFolder?: string;
    chatJid?: string;
    isMain?: boolean;
    toolPolicyMode?: SandboxToolPolicyMode;
    timeoutMs?: number;
    additionalDirectories?: string[];
    settingSources?: Array<'project' | 'user' | 'local'>;
}
export declare function executeClaudeSdkPrompt(opts: ClaudeSdkPromptOptions): Promise<string>;
//# sourceMappingURL=claude-sdk-executor.d.ts.map