/**
 * NanoClaw Direct Runner
 *
 * Fast path that bypasses container spin-up for social, chat, and business messages.
 * Container is only used for complex tasks that need tool access (files, bash, etc).
 *
 * Tier routing:
 *   social / chat  → nanbeige4.1 direct (~500ms, free)
 *                  → smollm2 fallback if nanbeige4.1 fails
 *   business       → Claude Agent SDK via OAuth (~1-2s)
 *                  → openrouter:anthropic/claude-3-5-sonnet on rate limit (same prompts)
 *                  → phi4-mini local last resort
 *   complex        → return false → container runner handles it
 */
import { Channel, NewMessage } from './types.js';
import { ExecutionRoutingContext } from './execution-routing.js';
import type { ClassifierResult } from './task-classifier.js';
export type Intent = 'social' | 'chat' | 'business' | 'complex';
export interface DirectRunResult {
    handled: boolean;
    lane_used: 'copaw' | 'keet' | 'fallback';
    fallback_reason?: string;
}
export declare function classifyIntent(messages: NewMessage[]): Intent;
/**
 * Attempt to handle the message directly (no container).
 * Returns true if handled, false to let container-runner take over.
 *
 * Now mode-router aware: picks provider/model from ProviderPlan,
 * injects web search context when plan.needsWebSearch is true,
 * and walks the fallback chain on failure.
 */
export declare function runDirectForGroup(groupJid: string, telegram: Channel, messages: NewMessage[], intent: Intent, routingContext?: ExecutionRoutingContext, forcedClassification?: ClassifierResult, options?: {
    allowContainerFallback?: boolean;
}): Promise<DirectRunResult>;
//# sourceMappingURL=direct-runner.d.ts.map