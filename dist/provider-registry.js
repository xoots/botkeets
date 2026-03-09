/**
 * Provider Registry
 *
 * Dynamic source of truth for routing tiers.
 * Registry entries resolve lazily so KEET-local env/config changes can
 * override defaults without requiring a process restart.
 */
import { DASHSCOPE_STD_MODEL, STD_BRAIN_MODEL } from './config.js';
import { resolveEffectiveOllamaModel, resolveEffectiveProviderModel } from './keet-provider-config.js';
const DEFAULTS = {
    eco_chat: { provider: 'deepseek', model: process.env.ECO_CHAT_MODEL || 'deepseek-reasoner' },
    eco_tiny: { provider: 'deepseek', model: process.env.ECO_TINY_MODEL || 'deepseek-reasoner' },
    eco_coder: { provider: 'deepseek', model: process.env.ECO_CODER_MODEL || 'deepseek-reasoner' },
    std_chat: { provider: 'dashscope', model: DASHSCOPE_STD_MODEL },
    std_coder: { provider: 'dashscope', model: process.env.DASHSCOPE_CODER_MODEL || 'qwen3-coder-next' },
    std_coder_flash: { provider: 'dashscope', model: process.env.DASHSCOPE_CODER_FLASH_MODEL || 'qwen3-coder-flash' },
    pro_reason: { provider: 'dashscope', model: process.env.DASHSCOPE_REASON_MODEL || 'qwen-plus' },
    pro_claude: { provider: 'deepseek', model: process.env.PRO_MODEL || 'deepseek-reasoner' },
    pro_or: { provider: 'dashscope', model: process.env.PRO_DASHSCOPE_MODEL || 'qwen3.5-plus' },
    pro_claude_coder: { provider: 'deepseek', model: process.env.PRO_CODER_MODEL || 'deepseek-reasoner' },
    eco_brain: { provider: 'dashscope', model: process.env.ECO_BRAIN_MODEL || 'qwen3.5-plus' },
    std_brain: { provider: 'deepseek', model: STD_BRAIN_MODEL },
    pro_brain: { provider: 'claude', model: process.env.PRO_BRAIN_MODEL || 'claude-sonnet-4-6' },
};
function resolveRegistryEntry(key) {
    const entry = DEFAULTS[key];
    if (entry.provider === 'ollama') {
        const resolved = resolveEffectiveOllamaModel(entry.model);
        return { provider: entry.provider, model: resolved.model };
    }
    if (entry.provider === 'claude') {
        const resolved = resolveEffectiveProviderModel('anthropic', entry.model);
        return { provider: entry.provider, model: resolved.model };
    }
    if (entry.provider === 'dashscope' || entry.provider === 'openrouter' || entry.provider === 'deepseek') {
        const resolved = resolveEffectiveProviderModel(entry.provider, entry.model);
        return { provider: entry.provider, model: resolved.model };
    }
    return entry;
}
export const REGISTRY = {
    get eco_chat() { return resolveRegistryEntry('eco_chat'); },
    get eco_tiny() { return resolveRegistryEntry('eco_tiny'); },
    get eco_coder() { return resolveRegistryEntry('eco_coder'); },
    get std_chat() { return resolveRegistryEntry('std_chat'); },
    get std_coder() { return resolveRegistryEntry('std_coder'); },
    get std_coder_flash() { return resolveRegistryEntry('std_coder_flash'); },
    get pro_reason() { return resolveRegistryEntry('pro_reason'); },
    get pro_claude() { return resolveRegistryEntry('pro_claude'); },
    get pro_or() { return resolveRegistryEntry('pro_or'); },
    get pro_claude_coder() { return resolveRegistryEntry('pro_claude_coder'); },
    get eco_brain() { return resolveRegistryEntry('eco_brain'); },
    get std_brain() { return resolveRegistryEntry('std_brain'); },
    get pro_brain() { return resolveRegistryEntry('pro_brain'); },
};
/** Fallback chains per tier — ordered by preference */
export const FALLBACK_CHAINS = {
    get eco() { return []; },
    get standard() { return [REGISTRY.std_chat, REGISTRY.std_brain, REGISTRY.eco_chat]; },
    get pro() { return [REGISTRY.pro_claude, REGISTRY.pro_reason, REGISTRY.std_brain]; },
    get coding() { return [REGISTRY.std_coder, REGISTRY.std_coder_flash, REGISTRY.std_brain]; },
    get coding_pro() { return [REGISTRY.pro_claude_coder, REGISTRY.std_coder, REGISTRY.std_coder_flash, REGISTRY.std_brain]; },
    get overseer() { return [REGISTRY.eco_brain, REGISTRY.std_brain, REGISTRY.pro_brain]; },
    get planner() { return [REGISTRY.eco_brain, REGISTRY.std_brain]; },
};
//# sourceMappingURL=provider-registry.js.map