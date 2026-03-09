/**
 * Mode Router
 *
 * The decision engine that combines:
 *   1. Active mode for this chat (eco / standard / pro / auto)
 *   2. Task classifier output (task_type, complexity, quality_stakes)
 *   3. Any inline override (!eco / !pro / etc.)
 *
 * ...and returns a ProviderPlan describing exactly which provider + model to use,
 * plus a fallback chain.
 *
 * Provider tiers:
 *   local      → Ollama (qwen3:8b | smollm2:1.7b) — zero cost, ~500ms
 *   standard   → Claude Haiku / Perplexity (search) — cheap, ~1-2s
 *   pro        → Claude Sonnet / openrouter/auto — best quality, ~2-5s
 *
 * OpenRouter Auto Router (`openrouter/auto`) is powered by NotDiamond ML:
 * routes across 58+ models at zero markup, ~25ms overhead.
 * Used in standard/pro when cloud is needed to avoid maintaining our own model list.
 */
import { Mode } from './mode-manager.js';
import { ClassifierResult } from './task-classifier.js';
import { ExecutionRoutingContext } from './execution-routing.js';
import { getKeetProviderCapability } from './keet-provider-config.js';
export type Provider = 'ollama' | 'claude' | 'openrouter' | 'perplexity' | 'dashscope' | 'deepseek';
export interface ProviderPlan {
    /** Primary provider */
    provider: Provider;
    /** Model name / path for primary */
    model: string;
    /** Ordered fallback chain if primary fails */
    fallbacks: Array<{
        provider: Provider;
        model: string;
    }>;
    /** Whether a web search should be injected before LLM call */
    needsWebSearch: boolean;
    /** Whether a container should be spawned (complex tasks only) */
    needsContainer: boolean;
    /** Resolved mode after overrides + auto classification */
    resolvedMode: Mode | 'eco' | 'standard' | 'pro';
    /** Classification result (if auto mode was used) */
    classification?: ClassifierResult;
    /** Whether the classifier used rule-based fallback */
    classifierFallback?: boolean;
    /** Provider compatibility metadata for the selected provider */
    providerCapability?: ReturnType<typeof getKeetProviderCapability>;
    /** Non-fatal routing warnings */
    warnings?: string[];
    /** Selected orchestration lane */
    lane?: 'copaw_orchestrator' | 'keet_execution';
    /** Why this lane was chosen */
    laneReason?: string;
    /** Whether CoPaw lane eligibility checks passed */
    copawEligible?: boolean;
}
/**
 * Route a message to the appropriate provider plan.
 *
 * @param chatJid  The chat identifier (used to look up persistent mode)
 * @param content  Raw message content (may contain override prefix)
 * @returns        A ProviderPlan ready for the provider layer to execute
 */
export declare function routeMessage(chatJid: string, content: string, routingContext?: ExecutionRoutingContext, forcedClassification?: ClassifierResult): Promise<ProviderPlan>;
//# sourceMappingURL=mode-router.d.ts.map