/**
 * KEET Provider Configuration
 *
 * Active authority bridge for provider/model/base-URL resolution.
 * CoPaw authority is used when configured and available; otherwise KEET-local
 * env/config values remain the fallback source of truth.
 */
/**
 * KEET provider capability information.
 */
export interface KeetProviderCapability {
    provider_id: string;
    compatible_with_keet: boolean;
    supported_task_types: string[];
    supported_modes: Array<'eco' | 'standard' | 'pro'>;
    reason?: string;
}
/**
 * Provider resolution result.
 */
export interface KeetProviderResolution {
    authority: 'copaw' | 'legacy';
    provider_id: string;
    model: string;
    api_key: string;
    base_url: string;
    is_local: boolean;
    warnings: string[];
}
/**
 * Execution readiness check result.
 */
export interface KeetExecutionReadiness {
    ok: boolean;
    errors: string[];
    warnings: string[];
    mode: 'eco' | 'standard' | 'pro' | 'auto';
}
export interface KeetResolvedModeProvider {
    provider_id: 'ollama' | 'anthropic' | 'openrouter' | 'dashscope';
    model: string;
}
/**
 * Get KEET provider capability information.
 */
export declare function getKeetProviderCapability(providerId: string): KeetProviderCapability;
/**
 * Resolve the effective Ollama base URL from KEET-local config.
 */
export declare function resolveEffectiveOllamaBaseUrl(legacyBaseUrl: string): {
    base_url: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
/**
 * Resolve the effective Ollama model from KEET-local config.
 */
export declare function resolveEffectiveOllamaModel(legacyModel: string): {
    model: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
/**
 * Resolve the effective provider model from KEET-local config.
 */
export declare function resolveEffectiveProviderModel(providerId: string, legacyModel: string): {
    model: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
/**
 * Resolve the effective provider credential from KEET-local config.
 */
export declare function resolveEffectiveProviderCredential(providerId: string, legacyApiKey: string, legacyBaseUrl?: string): {
    api_key: string;
    base_url: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
/**
 * Validate KEET execution readiness for the specified mode.
 */
export declare function validateKeetExecutionReadiness(mode: 'eco' | 'standard' | 'pro' | 'auto'): KeetExecutionReadiness;
export declare function resolvePrimaryProviderForMode(mode: 'eco' | 'standard' | 'pro' | 'auto'): KeetResolvedModeProvider;
//# sourceMappingURL=keet-provider-config.d.ts.map