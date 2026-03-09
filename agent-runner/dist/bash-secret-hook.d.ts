import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
export declare function buildSecretUnsetPrefix(secretKeys: string[]): string;
export declare function createSanitizeBashHook(secretKeys: string[]): HookCallback;
