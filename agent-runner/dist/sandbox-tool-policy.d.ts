import { type ToolPolicy } from './dangerous-tools.js';
export type SandboxToolPolicyMode = 'workspace-write' | 'safe-only' | 'chat-only';
export interface ToolPolicyDecision {
    toolName: string;
    mode: SandboxToolPolicyMode;
    policy: ToolPolicy;
    allowed: boolean;
    reason?: string;
}
export declare function normalizeToolPolicyMode(mode: string | undefined): SandboxToolPolicyMode;
export declare function evaluateToolPolicy(toolName: string, mode: string | undefined): ToolPolicyDecision;
export declare function filterToolsForPolicy(toolNames: string[], mode: string | undefined): string[];
