import { vi, describe, it, expect, beforeEach } from 'vitest';
vi.mock('../keet-provider-config.js', () => ({
    resolvePrimaryProviderForMode: vi.fn(),
    getKeetProviderCapability: vi.fn(),
    resolveEffectiveOllamaModel: vi.fn(() => ({ model: 'qwen3:8b', authority: 'legacy', warnings: [] })),
}));
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import { resolvePrimaryProviderForMode, getKeetProviderCapability, resolveEffectiveOllamaModel, } from '../keet-provider-config.js';
import { resolveRuntime } from '../runtime-resolver.js';
const mockResolvePrimary = vi.mocked(resolvePrimaryProviderForMode);
const mockGetCapability = vi.mocked(getKeetProviderCapability);
const mockResolveOllama = vi.mocked(resolveEffectiveOllamaModel);
function makeContext(mode) {
    return {
        requested_mode: null,
        effective_mode: mode,
        source: 'chat_default',
        inline_override: null,
        clean_content: 'test message',
    };
}
const compatibleCapability = {
    provider_id: '',
    compatible_with_keet: true,
    supported_task_types: ['chat', 'code', 'complex'],
    supported_modes: ['eco', 'standard', 'pro'],
};
const incompatibleCapability = {
    provider_id: '',
    compatible_with_keet: false,
    supported_task_types: [],
    supported_modes: [],
    reason: 'Provider is not supported.',
};
beforeEach(() => {
    vi.clearAllMocks();
    // Default safe fallback for resolveEffectiveOllamaModel
    mockResolveOllama.mockReturnValue({ model: 'qwen3:8b', authority: 'legacy', warnings: [] });
});
describe('resolveRuntime', () => {
    it('eco mode → ollama runner', () => {
        mockResolvePrimary.mockReturnValue({ provider_id: 'ollama', model: 'qwen3:8b' });
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'ollama' });
        const decision = resolveRuntime(makeContext('eco'));
        expect(decision.runner).toBe('ollama');
        expect(decision.containerScript).toBe('index-ollama.js');
    });
    it('pro mode → claude runner', () => {
        mockResolvePrimary.mockReturnValue({ provider_id: 'anthropic', model: 'claude-sonnet-4-6' });
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'anthropic' });
        const decision = resolveRuntime(makeContext('pro'));
        expect(decision.runner).toBe('claude');
        expect(decision.containerScript).toBe('index.js');
        expect(decision.providerKeyEnv).toBe('CLAUDE_CODE_OAUTH_TOKEN');
    });
    it('standard mode → dashscope runner', () => {
        mockResolvePrimary.mockReturnValue({ provider_id: 'dashscope', model: 'qwen-plus' });
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'dashscope' });
        const decision = resolveRuntime(makeContext('standard'));
        expect(decision.runner).toBe('dashscope');
        expect(decision.containerScript).toBe('index-dashscope.js');
    });
    it('providerPlan override uses plan provider', () => {
        // Mode is eco but providerPlan specifies openrouter — plan wins
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'openrouter' });
        const plan = {
            provider: 'openrouter',
            model: 'gpt-4o',
            fallbacks: [],
            needsWebSearch: false,
            needsContainer: false,
            resolvedMode: 'eco',
        };
        const decision = resolveRuntime(makeContext('eco'), plan);
        expect(decision.runner).toBe('openrouter');
        expect(decision.model).toBe('gpt-4o');
    });
    it('incompatible provider falls back to next in chain', () => {
        // perplexity is incompatible → openrouter fallback is used
        mockGetCapability.mockImplementation((providerId) => {
            if (providerId === 'perplexity') {
                return { ...incompatibleCapability, provider_id: 'perplexity' };
            }
            if (providerId === 'openrouter') {
                return { ...compatibleCapability, provider_id: 'openrouter' };
            }
            return { ...incompatibleCapability, provider_id: providerId };
        });
        const plan = {
            provider: 'perplexity',
            model: 'pplx-7b',
            fallbacks: [{ provider: 'openrouter', model: 'gpt-4o-mini' }],
            needsWebSearch: false,
            needsContainer: false,
            resolvedMode: 'standard',
        };
        const decision = resolveRuntime(makeContext('standard'), plan);
        expect(decision.runner).toBe('openrouter');
        expect(decision.model).toBe('gpt-4o-mini');
    });
    it('no providerPlan and primary provider incompatible → ollama safety fallback', () => {
        mockResolvePrimary.mockReturnValue({ provider_id: 'anthropic', model: 'claude-opus' });
        mockGetCapability.mockReturnValue({ ...incompatibleCapability, provider_id: 'anthropic' });
        mockResolveOllama.mockReturnValue({ model: 'qwen3:8b', authority: 'legacy', warnings: [] });
        const decision = resolveRuntime(makeContext('pro'));
        expect(decision.runner).toBe('ollama');
        expect(decision.model).toBe('qwen3:8b');
    });
    it('every RuntimeDecision has a non-empty reason', () => {
        // Test cases 1–4 each produce a decision with a non-empty reason string.
        // Case 1: eco → ollama
        mockResolvePrimary.mockReturnValue({ provider_id: 'ollama', model: 'qwen3:8b' });
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'ollama' });
        const d1 = resolveRuntime(makeContext('eco'));
        expect(typeof d1.reason).toBe('string');
        expect(d1.reason.length).toBeGreaterThan(0);
        // Case 2: pro → claude
        mockResolvePrimary.mockReturnValue({ provider_id: 'anthropic', model: 'claude-sonnet-4-6' });
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'anthropic' });
        const d2 = resolveRuntime(makeContext('pro'));
        expect(typeof d2.reason).toBe('string');
        expect(d2.reason.length).toBeGreaterThan(0);
        // Case 3: standard → dashscope
        mockResolvePrimary.mockReturnValue({ provider_id: 'dashscope', model: 'qwen-plus' });
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'dashscope' });
        const d3 = resolveRuntime(makeContext('standard'));
        expect(typeof d3.reason).toBe('string');
        expect(d3.reason.length).toBeGreaterThan(0);
        // Case 4: providerPlan override
        mockGetCapability.mockReturnValue({ ...compatibleCapability, provider_id: 'openrouter' });
        const plan = {
            provider: 'openrouter',
            model: 'gpt-4o',
            fallbacks: [],
            needsWebSearch: false,
            needsContainer: false,
            resolvedMode: 'eco',
        };
        const d4 = resolveRuntime(makeContext('eco'), plan);
        expect(typeof d4.reason).toBe('string');
        expect(d4.reason.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=runtime-resolver.test.js.map