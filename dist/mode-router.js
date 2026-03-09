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
import { getMode } from './mode-manager.js';
import { parseOverride } from './override-parser.js';
import { classifyTask } from './task-classifier.js';
import { logRoutingDecision } from './routing-logger.js';
import { BRAVE_API_KEY, PERPLEXITY_API_KEY, DASHSCOPE_API_KEY, DEEPSEEK_API_KEY, COPAW_ENABLED } from './config.js';
import { logger } from './logger.js';
import { REGISTRY, FALLBACK_CHAINS } from './provider-registry.js';
import { resolveExecutionLaneDecision } from './execution-routing.js';
import { getKeetProviderCapability, resolveEffectiveProviderCredential } from './keet-provider-config.js';
import { getCoPawLaneHealth } from './copaw-lane-bridge.js';
// ── Model constants ────────────────────────────────────────────────────────────
// Model constants now come from provider-registry.ts
const LOCAL_CHAT_MODEL = REGISTRY.eco_chat.model;
const LOCAL_TINY_MODEL = REGISTRY.eco_tiny.model;
const PRO_PRIMARY_MODEL = REGISTRY.pro_claude.model;
// ── Helpers ────────────────────────────────────────────────────────────────────
function hasCloud() {
    return !!(resolveEffectiveProviderCredential('dashscope', DASHSCOPE_API_KEY).api_key ||
        resolveEffectiveProviderCredential('deepseek', DEEPSEEK_API_KEY).api_key);
}
function hasDashScope() {
    return !!resolveEffectiveProviderCredential('dashscope', DASHSCOPE_API_KEY).api_key;
}
function hasBrave() {
    return !!BRAVE_API_KEY;
}
function hasPerplexity() {
    return !!PERPLEXITY_API_KEY;
}
/** Is this a research/search request that benefits from web grounding? */
function needsSearch(classification) {
    return (classification.task_type === 'research' ||
        (classification.task_type === 'business' && classification.quality_stakes === 'high'));
}
/** Does this task require container-level tool access? */
function needsContainer(classification) {
    return classification.task_type === 'code' || classification.task_type === 'complex';
}
// ── Plan builders ──────────────────────────────────────────────────────────────
function ecoPlan(classification) {
    const isSimple = classification.complexity === 'low';
    const doSearch = needsSearch(classification);
    const doContainer = needsContainer(classification);
    return {
        provider: 'deepseek',
        model: isSimple ? LOCAL_TINY_MODEL : LOCAL_CHAT_MODEL,
        fallbacks: [],
        needsWebSearch: doSearch,
        needsContainer: doContainer,
        resolvedMode: 'eco',
        classification,
        providerCapability: getKeetProviderCapability('deepseek'),
        warnings: [],
    };
}
function standardPlan(classification) {
    const doSearch = needsSearch(classification);
    const doContainer = needsContainer(classification);
    if (!hasCloud()) {
        // No cloud keys at all — force explicit cloud-only configuration failure path.
        return {
            ...ecoPlan(classification),
            resolvedMode: 'standard',
            needsWebSearch: doSearch,
        };
    }
    // STANDARD: DashScope qwen3.5-flash when key is present — faster and cheaper
    // than OpenRouter for Qwen models, direct API, no markup.
    // Otherwise: openrouter/auto (NotDiamond picks cheapest capable model).
    // Final fallback: local qwen3:8b.
    if (hasDashScope()) {
        return {
            provider: REGISTRY.std_chat.provider,
            model: REGISTRY.std_chat.model,
            fallbacks: FALLBACK_CHAINS.standard,
            needsWebSearch: doSearch,
            needsContainer: doContainer,
            resolvedMode: 'standard',
            classification,
            providerCapability: getKeetProviderCapability(REGISTRY.std_chat.provider),
            warnings: [],
        };
    }
    return {
        provider: 'deepseek',
        model: REGISTRY.std_brain.model,
        fallbacks: [{ provider: REGISTRY.std_chat.provider, model: REGISTRY.std_chat.model }],
        needsWebSearch: doSearch,
        needsContainer: doContainer,
        resolvedMode: 'standard',
        classification,
        providerCapability: getKeetProviderCapability('deepseek'),
        warnings: [],
    };
}
function proPlan(classification) {
    const doSearch = needsSearch(classification);
    const doContainer = needsContainer(classification);
    if (!hasCloud()) {
        return {
            ...ecoPlan(classification),
            resolvedMode: 'pro',
            needsWebSearch: doSearch,
        };
    }
    // PRO: DeepSeek primary for now, with DashScope fallbacks.
    return {
        provider: 'deepseek',
        model: PRO_PRIMARY_MODEL,
        fallbacks: FALLBACK_CHAINS.pro,
        needsWebSearch: doSearch,
        needsContainer: doContainer,
        resolvedMode: 'pro',
        classification,
        providerCapability: getKeetProviderCapability('deepseek'),
        warnings: [],
    };
}
function normalizeCapabilityProvider(provider) {
    return provider === 'claude' ? 'anthropic' : provider;
}
function annotatePlan(plan) {
    const warnings = [...(plan.warnings || [])];
    const providerCapability = getKeetProviderCapability(normalizeCapabilityProvider(plan.provider));
    const fallbacks = plan.fallbacks.filter((entry) => {
        const capability = getKeetProviderCapability(normalizeCapabilityProvider(entry.provider));
        if (!capability.compatible_with_keet) {
            warnings.push(capability.reason || `Fallback provider '${entry.provider}' is not compatible with KEET.`);
            return false;
        }
        return true;
    });
    if (!providerCapability.compatible_with_keet) {
        warnings.push(providerCapability.reason || `Provider '${plan.provider}' is not compatible with KEET.`);
    }
    return {
        ...plan,
        fallbacks,
        providerCapability,
        warnings,
    };
}
// ── Main entry ─────────────────────────────────────────────────────────────────
/**
 * Route a message to the appropriate provider plan.
 *
 * @param chatJid  The chat identifier (used to look up persistent mode)
 * @param content  Raw message content (may contain override prefix)
 * @returns        A ProviderPlan ready for the provider layer to execute
 */
export async function routeMessage(chatJid, content, routingContext, forcedClassification) {
    const start = Date.now();
    // 1. Determine cleaned text + effective mode
    const fallbackParsed = parseOverride(content);
    const cleanContent = routingContext?.clean_content ?? fallbackParsed.content;
    const baseMode = getMode(chatJid);
    const modeOverride = routingContext?.inline_override ?? fallbackParsed.modeOverride;
    const effectiveMode = routingContext
        ? (routingContext.requested_mode ?? 'auto')
        : (modeOverride ?? baseMode);
    // 3. Classify the task (skip if not needed in eco mode)
    let classification = forcedClassification;
    let classifierFallback = false;
    if (!forcedClassification && !routingContext) {
        const result = await classifyTask(cleanContent, /* useLocal */ true);
        classification = result;
        classifierFallback = result.usedFallback;
    }
    if (!classification) {
        classification = {
            task_type: 'chat',
            complexity: 'low',
            quality_stakes: 'medium',
            recommended_mode: 'standard',
            reasoning: 'Fallback classification',
        };
        classifierFallback = true;
    }
    // 4. Build the plan
    let plan;
    let resolvedMode;
    if (routingContext) {
        resolvedMode = routingContext.effective_mode;
        if (resolvedMode === 'eco')
            plan = ecoPlan(classification);
        else if (resolvedMode === 'pro')
            plan = proPlan(classification);
        else
            plan = standardPlan(classification);
    }
    else if (effectiveMode === 'eco') {
        resolvedMode = 'eco';
        plan = ecoPlan(classification);
    }
    else if (effectiveMode === 'pro') {
        resolvedMode = 'pro';
        plan = proPlan(classification);
    }
    else if (effectiveMode === 'standard') {
        resolvedMode = 'standard';
        plan = standardPlan(classification);
    }
    else {
        // AUTO: use classifier's recommendation
        resolvedMode = classification.recommended_mode === 'auto' ? 'standard' : classification.recommended_mode;
        if (resolvedMode === 'eco')
            plan = ecoPlan(classification);
        else if (resolvedMode === 'pro')
            plan = proPlan(classification);
        else
            plan = standardPlan(classification);
    }
    plan.classification = classification;
    plan.classifierFallback = classifierFallback;
    plan = annotatePlan(plan);
    const laneDecision = resolveExecutionLaneDecision({
        effective_mode: resolvedMode,
        classification,
        needs_container: plan.needsContainer,
        intent: classification.task_type,
        copaw_enabled: COPAW_ENABLED,
        copaw_healthy: !getCoPawLaneHealth().circuit_open,
    });
    plan.lane = routingContext?.lane ?? laneDecision.lane;
    plan.laneReason = routingContext?.lane_reason ?? laneDecision.reason;
    plan.copawEligible = routingContext?.copaw_lane_eligible ?? laneDecision.copaw_eligible;
    // 5. Log the routing decision
    const latencyMs = Date.now() - start;
    // Token counts are 0 here — the router only picks the plan, it doesn't call models.
    // The actual API callers (direct-runner, container-runner) log the real token usage.
    logRoutingDecision({
        chatJid,
        intent: classification.task_type,
        mode: effectiveMode,
        modeOverride: modeOverride !== null,
        provider: plan.provider,
        model: plan.model,
        inputTokens: 0,
        outputTokens: 0,
        usdCost: 0,
        latencyMs,
        success: true,
        fallback: classifierFallback,
        lane_used: plan.lane,
        note: [classification.reasoning, ...(plan.warnings || []).slice(0, 1)].filter(Boolean).join(' | '),
    });
    logger.debug({ chatJid, mode: effectiveMode, resolvedMode, provider: plan.provider, model: plan.model, latencyMs }, 'Route decided');
    return plan;
}
//# sourceMappingURL=mode-router.js.map