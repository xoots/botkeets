/**
 * KEET Provider Configuration
 *
 * Active authority bridge for provider/model/base-URL resolution.
 * CoPaw authority is used when configured and available; otherwise KEET-local
 * env/config values remain the fallback source of truth.
 */
import { OLLAMA_HOST, CLAUDE_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, OPENROUTER_API_KEY, DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL, DASHSCOPE_STD_MODEL, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, KEET_COPAW_MIGRATION_PHASE, } from './config.js';
import { resolveEffectiveOllamaBaseUrl as resolveCoPawOllamaBaseUrl, resolveEffectiveOllamaModel as resolveCoPawOllamaModel, resolveEffectiveProviderCredential as resolveCoPawProviderCredential, resolveEffectiveProviderModel as resolveCoPawProviderModel, validateKeetExecutionReadiness as validateCoPawExecutionReadiness, } from './copaw-system.js';
import { shouldAllowLegacyReads, trackLegacyRead, } from './copaw-migration.js';
import { logger } from './logger.js';
const legacyFallbackLogKeys = new Set();
function emitLegacyFallbackTelemetry(scope, providerId, warnings) {
    trackLegacyRead(`provider.${scope}`, providerId);
    if (!shouldAllowLegacyReads())
        return;
    const key = `${scope}:${providerId}`;
    if (legacyFallbackLogKeys.has(key))
        return;
    legacyFallbackLogKeys.add(key);
    logger.warn({
        telemetry: 'provider_authority_deprecated_fallback',
        scope,
        provider_id: providerId,
        warnings,
    }, 'Deprecated legacy provider fallback used; migrate provider configuration to CoPaw authority.');
}
/**
 * Check if a provider is compatible with KEET runtime.
 */
function isKeetCompatibleProvider(providerId) {
    return ['ollama', 'anthropic', 'openrouter', 'dashscope', 'deepseek'].includes(providerId);
}
/**
 * Get KEET provider capability information.
 */
export function getKeetProviderCapability(providerId) {
    switch (providerId) {
        case 'ollama':
            return {
                provider_id: providerId,
                compatible_with_keet: true,
                supported_task_types: ['chat', 'search', 'fetch', 'code', 'complex', 'business'],
                supported_modes: ['eco', 'standard'],
            };
        case 'anthropic':
            return {
                provider_id: providerId,
                compatible_with_keet: true,
                supported_task_types: ['chat', 'business', 'code', 'complex'],
                supported_modes: ['pro'],
            };
        case 'openrouter':
            return {
                provider_id: providerId,
                compatible_with_keet: true,
                supported_task_types: ['chat', 'business', 'code', 'complex'],
                supported_modes: ['standard', 'pro'],
            };
        case 'dashscope':
            return {
                provider_id: providerId,
                compatible_with_keet: true,
                supported_task_types: ['chat', 'business', 'code', 'complex'],
                supported_modes: ['standard', 'pro'],
            };
        case 'deepseek':
            return {
                provider_id: providerId,
                compatible_with_keet: true,
                supported_task_types: ['business', 'code', 'complex'],
                supported_modes: ['standard', 'pro'],
            };
        default:
            return {
                provider_id: providerId,
                compatible_with_keet: false,
                supported_task_types: [],
                supported_modes: [],
                reason: 'Provider is not yet supported by KEET runtime.',
            };
    }
}
/**
 * Resolve the effective Ollama base URL from KEET-local config.
 */
export function resolveEffectiveOllamaBaseUrl(legacyBaseUrl) {
    const fallbackBaseUrl = (OLLAMA_HOST || legacyBaseUrl || 'http://localhost:11434').replace(/\/v1\/?$/, '');
    const resolved = resolveCoPawOllamaBaseUrl(fallbackBaseUrl);
    if (resolved.authority === 'legacy') {
        emitLegacyFallbackTelemetry('ollama_base_url', 'ollama', resolved.warnings);
        if (!shouldAllowLegacyReads()) {
            return {
                base_url: '',
                authority: 'copaw',
                warnings: [
                    ...resolved.warnings,
                    `Legacy fallback blocked by CoPaw migration phase '${KEET_COPAW_MIGRATION_PHASE}'.`,
                ],
            };
        }
    }
    return resolved;
}
/**
 * Resolve the effective Ollama model from KEET-local config.
 */
export function resolveEffectiveOllamaModel(legacyModel) {
    const resolved = resolveCoPawOllamaModel(legacyModel);
    if (resolved.authority === 'legacy') {
        emitLegacyFallbackTelemetry('ollama_model', 'ollama', resolved.warnings);
        if (!shouldAllowLegacyReads()) {
            return {
                model: '',
                authority: 'copaw',
                warnings: [
                    ...resolved.warnings,
                    `Legacy fallback blocked by CoPaw migration phase '${KEET_COPAW_MIGRATION_PHASE}'.`,
                ],
            };
        }
    }
    return resolved;
}
/**
 * Resolve the effective provider model from KEET-local config.
 */
export function resolveEffectiveProviderModel(providerId, legacyModel) {
    const resolved = resolveCoPawProviderModel(providerId, legacyModel);
    if (resolved.authority === 'legacy') {
        emitLegacyFallbackTelemetry('provider_model', providerId, resolved.warnings);
        if (!shouldAllowLegacyReads()) {
            return {
                model: '',
                authority: 'copaw',
                warnings: [
                    ...resolved.warnings,
                    `Legacy fallback blocked by CoPaw migration phase '${KEET_COPAW_MIGRATION_PHASE}'.`,
                ],
            };
        }
    }
    return resolved;
}
/**
 * Resolve the effective provider credential from KEET-local config.
 */
export function resolveEffectiveProviderCredential(providerId, legacyApiKey, legacyBaseUrl = '') {
    let fallbackApiKey = legacyApiKey;
    let fallbackBaseUrl = legacyBaseUrl;
    switch (providerId) {
        case 'anthropic':
            fallbackApiKey = CLAUDE_API_KEY || CLAUDE_CODE_OAUTH_TOKEN || legacyApiKey;
            fallbackBaseUrl = 'https://api.anthropic.com';
            break;
        case 'openrouter':
            fallbackApiKey = OPENROUTER_API_KEY || legacyApiKey;
            fallbackBaseUrl = 'https://openrouter.ai/api/v1';
            break;
        case 'dashscope':
            fallbackApiKey = DASHSCOPE_API_KEY || legacyApiKey;
            fallbackBaseUrl = DASHSCOPE_BASE_URL || legacyBaseUrl;
            break;
        case 'deepseek':
            fallbackApiKey = DEEPSEEK_API_KEY || legacyApiKey;
            fallbackBaseUrl = DEEPSEEK_BASE_URL || legacyBaseUrl;
            break;
        case 'ollama':
            fallbackApiKey = '';
            fallbackBaseUrl = OLLAMA_HOST || legacyBaseUrl;
            break;
    }
    const resolved = resolveCoPawProviderCredential(providerId, fallbackApiKey, fallbackBaseUrl);
    if (resolved.authority === 'legacy') {
        emitLegacyFallbackTelemetry('provider_credential', providerId, resolved.warnings);
        if (!shouldAllowLegacyReads()) {
            return {
                api_key: '',
                base_url: '',
                authority: 'copaw',
                warnings: [
                    ...resolved.warnings,
                    `Legacy fallback blocked by CoPaw migration phase '${KEET_COPAW_MIGRATION_PHASE}'.`,
                ],
            };
        }
    }
    return resolved;
}
/**
 * Validate KEET execution readiness for the specified mode.
 */
export function validateKeetExecutionReadiness(mode) {
    return validateCoPawExecutionReadiness(mode);
}
export function resolvePrimaryProviderForMode(mode) {
    const resolvedOllamaModel = resolveEffectiveOllamaModel(process.env.OLLAMA_CHAT_MODEL || 'qwen3:8b');
    const resolvedDashscope = resolveEffectiveProviderCredential('dashscope', DASHSCOPE_API_KEY || '', DASHSCOPE_BASE_URL || '');
    const resolvedOpenRouter = resolveEffectiveProviderCredential('openrouter', OPENROUTER_API_KEY || '', 'https://openrouter.ai/api/v1');
    const resolvedAnthropic = resolveEffectiveProviderCredential('anthropic', CLAUDE_API_KEY || CLAUDE_CODE_OAUTH_TOKEN || '', 'https://api.anthropic.com');
    if (mode === 'eco') {
        return {
            provider_id: 'ollama',
            model: resolvedOllamaModel.model,
        };
    }
    if (mode === 'standard') {
        if (resolvedDashscope.api_key) {
            return {
                provider_id: 'dashscope',
                model: resolveEffectiveProviderModel('dashscope', DASHSCOPE_STD_MODEL).model,
            };
        }
        if (resolvedOpenRouter.api_key || resolvedAnthropic.api_key) {
            return {
                provider_id: 'openrouter',
                model: resolveEffectiveProviderModel('openrouter', process.env.OPENROUTER_MODEL || 'qwen/qwen3-coder-flash').model,
            };
        }
        return {
            provider_id: 'ollama',
            model: resolvedOllamaModel.model,
        };
    }
    if (resolvedAnthropic.api_key) {
        return {
            provider_id: 'anthropic',
            model: resolveEffectiveProviderModel('anthropic', process.env.CLAUDE_MODEL || 'claude-sonnet-4-6').model,
        };
    }
    if (resolvedOpenRouter.api_key) {
        return {
            provider_id: 'openrouter',
            model: resolveEffectiveProviderModel('openrouter', process.env.OPENROUTER_MODEL || 'qwen/qwen3-coder-flash').model,
        };
    }
    if (resolvedDashscope.api_key) {
        return {
            provider_id: 'dashscope',
            model: resolveEffectiveProviderModel('dashscope', process.env.DASHSCOPE_REASON_MODEL || 'qwen-plus').model,
        };
    }
    return {
        provider_id: 'ollama',
        model: resolvedOllamaModel.model,
    };
}
//# sourceMappingURL=keet-provider-config.js.map