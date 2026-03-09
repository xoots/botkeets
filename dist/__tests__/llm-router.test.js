import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock(import('../config.js'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        CLAUDE_CODE_OAUTH_TOKEN: 'oauth-test-token',
        OPENROUTER_API_KEY: 'openrouter-test-key',
        DASHSCOPE_API_KEY: 'dashscope-test-key',
        DASHSCOPE_BASE_URL: 'https://dashscope.test',
        DEEPSEEK_API_KEY: 'deepseek-test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        OLLAMA_HOST: 'http://ollama.test',
    };
});
vi.mock('../keet-provider-config.js', () => ({
    resolveEffectiveOllamaBaseUrl: vi.fn(() => ({ base_url: 'http://ollama.test' })),
    resolveEffectiveProviderCredential: vi.fn((provider, apiKey, baseUrl = '') => ({
        api_key: apiKey || `${provider}-test-key`,
        base_url: baseUrl || `https://${provider}.test`,
    })),
}));
vi.mock('../provider-strategy.js', () => ({
    isOllamaAvailable: vi.fn(() => true),
    isRateLimitError: vi.fn((text) => /429|rate limit/i.test(text)),
}));
vi.mock('../claude-text-executor.js', () => ({
    executeClaudeTextPrompt: vi.fn(async () => ' Claude says hi '),
}));
vi.mock('../interaction-store.js', () => ({
    formatInteractionPrompt: vi.fn((messages) => messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n')),
    inferInteractionCaller: vi.fn(() => 'src/__tests__/llm-router.test.ts:1'),
    recordInteraction: vi.fn(),
}));
import { executeClaudeTextPrompt } from '../claude-text-executor.js';
import { runLlm } from '../llm-router.js';
describe('runLlm()', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });
    it('dedupes failed providers and falls back to the next viable route', async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
            ok: false,
            status: 429,
            text: async () => 'rate limit hit',
        })
            .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Fallback answer' } }],
            }),
        });
        const onRouteFailure = vi.fn();
        const result = await runLlm({
            messages: [
                { role: 'system', content: 'Be brief.' },
                { role: 'user', content: 'Hello' },
            ],
            routes: [
                { provider: 'openrouter', model: 'openrouter/primary' },
                { provider: 'openrouter', model: 'openrouter/secondary' },
                { provider: 'dashscope', model: 'qwen-plus' },
            ],
            dedupeProviderFailures: true,
            onRouteFailure,
        });
        expect(result.text).toBe('Fallback answer');
        expect(result.provider).toBe('dashscope');
        expect(result.usedFallback).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onRouteFailure).toHaveBeenCalledWith(expect.objectContaining({
            route: expect.objectContaining({ provider: 'openrouter', model: 'openrouter/primary' }),
            isRateLimit: true,
            skipped: false,
        }));
        expect(onRouteFailure).toHaveBeenCalledWith(expect.objectContaining({
            route: expect.objectContaining({ provider: 'openrouter', model: 'openrouter/secondary' }),
            skipped: true,
        }));
    });
    it('routes Claude text calls through the shared SDK wrapper', async () => {
        const result = await runLlm({
            messages: [
                { role: 'system', content: 'Reply casually.' },
                { role: 'user', content: 'Hi there' },
            ],
            routes: [{ provider: 'claude', model: 'claude-sonnet-4-6' }],
            workspaceDir: '/tmp/claude-workspace',
            settingSources: [],
        });
        expect(result.text).toBe('Claude says hi');
        expect(executeClaudeTextPrompt).toHaveBeenCalledWith({
            prompt: 'Hi there',
            systemPrompt: 'Reply casually.',
            model: 'claude-sonnet-4-6',
            workspaceDir: '/tmp/claude-workspace',
            timeoutMs: 30_000,
            settingSources: [],
        });
    });
});
//# sourceMappingURL=llm-router.test.js.map