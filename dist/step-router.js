import { resolveEffectiveOllamaModel, resolveEffectiveProviderModel, } from './keet-provider-config.js';
import { decideRiskBasedEscalation, } from './reasoning/risk-escalation.js';
const STRICT_LOCAL_OVERRIDE = (process.env.STRICT_LOCAL_OVERRIDE || 'false').toLowerCase() === 'true';
export function decideStepRouting(subtask, routingContext, attempt) {
    const ollamaDefault = resolveEffectiveOllamaModel(process.env.OLLAMA_CHAT_MODEL || process.env.OLLAMA_MODEL || 'qwen3:8b').model;
    const openrouterDefault = resolveEffectiveProviderModel('openrouter', process.env.OPENROUTER_MODEL || 'qwen/qwen3-coder-flash').model;
    const claudeDefault = resolveEffectiveProviderModel('anthropic', process.env.PRO_BRAIN_MODEL || 'claude-sonnet-4-6').model;
    const models = {
        eco_local: ollamaDefault,
        eco_search: ollamaDefault,
        standard_default: openrouterDefault,
        standard_escalation: claudeDefault,
        pro_default: claudeDefault,
    };
    const decision = decideRiskBasedEscalation({
        step: subtask,
        context: {
            effective_mode: routingContext.effective_mode,
            source: routingContext.source,
            lane: routingContext.lane,
        },
        attempt,
        models,
        strictLocalOverride: STRICT_LOCAL_OVERRIDE,
    });
    return {
        ...decision,
        provider: decision.provider,
        risk_level: decision.risk_level,
    };
}
//# sourceMappingURL=step-router.js.map