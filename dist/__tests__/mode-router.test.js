import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../mode-manager.js', () => ({
    getMode: vi.fn(() => 'auto'),
}));
vi.mock('../override-parser.js', () => ({
    parseOverride: vi.fn((content) => ({ content, modeOverride: null })),
}));
vi.mock('../task-classifier.js', () => ({
    classifyTask: vi.fn(async () => ({
        task_type: 'research',
        complexity: 'medium',
        quality_stakes: 'high',
        recommended_mode: 'standard',
        reasoning: 'research task',
        usedFallback: false,
    })),
}));
vi.mock('../routing-logger.js', () => ({
    logRoutingDecision: vi.fn(),
}));
vi.mock(import('../config.js'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        BRAVE_API_KEY: '',
        PERPLEXITY_API_KEY: '',
        DASHSCOPE_API_KEY: '',
        DEEPSEEK_API_KEY: '',
        COPAW_ENABLED: false,
    };
});
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../provider-registry.js', () => ({
    REGISTRY: {
        eco_chat: { provider: 'deepseek', model: 'qwen3:8b' },
        eco_tiny: { provider: 'deepseek', model: 'smollm2:1.7b' },
        pro_claude: { provider: 'deepseek', model: 'deepseek-reasoner' },
        std_chat: { provider: 'dashscope', model: 'qwen3.5-plus' },
        std_brain: { provider: 'deepseek', model: 'deepseek-reasoner' },
    },
    FALLBACK_CHAINS: {
        standard: [],
        pro: [],
    },
}));
vi.mock('../execution-routing.js', () => ({
    resolveExecutionLaneDecision: vi.fn(() => ({
        lane: 'keet_execution',
        reason: 'test',
        copaw_eligible: false,
    })),
}));
vi.mock('../keet-provider-config.js', () => ({
    getKeetProviderCapability: vi.fn(() => ({ compatible_with_keet: true })),
    resolveEffectiveProviderCredential: vi.fn(() => ({ api_key: '', base_url: '' })),
}));
vi.mock('../copaw-lane-bridge.js', () => ({
    getCoPawLaneHealth: vi.fn(() => ({ circuit_open: false })),
}));
import { routeMessage } from '../mode-router.js';
describe('routeMessage()', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });
    it('keeps web search enabled for research tasks even without Brave or Perplexity keys', async () => {
        const plan = await routeMessage('chat-1', 'find recent vendor pricing');
        expect(plan.needsWebSearch).toBe(true);
    });
});
//# sourceMappingURL=mode-router.test.js.map