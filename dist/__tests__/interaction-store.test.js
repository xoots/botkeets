import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
let activeInteractionStore = null;
async function loadRouterModules(loggingEnabled) {
    vi.resetModules();
    vi.doMock('../config.js', async (importOriginal) => {
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
            KEET_INTERACTION_LOGGING: loggingEnabled,
        };
    });
    vi.doMock('../keet-provider-config.js', () => ({
        resolveEffectiveOllamaBaseUrl: vi.fn(() => ({ base_url: 'http://ollama.test' })),
        resolveEffectiveProviderCredential: vi.fn((provider, apiKey, baseUrl = '') => ({
            api_key: apiKey || `${provider}-test-key`,
            base_url: baseUrl || `https://${provider}.test`,
        })),
    }));
    vi.doMock('../provider-strategy.js', () => ({
        isOllamaAvailable: vi.fn(() => true),
        isRateLimitError: vi.fn((text) => /429|rate limit/i.test(text)),
    }));
    vi.doMock('../claude-text-executor.js', () => ({
        executeClaudeTextPrompt: vi.fn(async () => 'Claude says hi'),
    }));
    const interactionStore = await import('../interaction-store.js');
    activeInteractionStore = interactionStore;
    const llmRouter = await import('../llm-router.js');
    return { interactionStore, llmRouter };
}
describe('interaction-store integration', () => {
    afterEach(() => {
        activeInteractionStore?.resetInteractionStoreForTests();
        activeInteractionStore = null;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.resetModules();
    });
    it('persists router attempts and supports read filtering', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keet-interactions-'));
        const dbPath = path.join(tempDir, 'messages.db');
        const { interactionStore, llmRouter } = await loadRouterModules(true);
        interactionStore.setInteractionStorePathForTests(dbPath);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Logged answer' } }],
                usage: { prompt_tokens: 12, completion_tokens: 7 },
            }),
        }));
        await llmRouter.runLlm({
            caller: 'src/test-caller.ts:12',
            messages: [
                { role: 'system', content: 'Use token=super-secret-token' },
                { role: 'user', content: 'Hello there' },
            ],
            routes: [{ provider: 'openrouter', model: 'gpt-4o-mini' }],
        });
        const rows = interactionStore.listInteractions({ limit: 10 });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            provider: 'openrouter',
            model: 'gpt-4o-mini',
            caller: 'src/test-caller.ts:12',
            success: true,
            input_tokens: 12,
            output_tokens: 7,
        });
        expect(rows[0].prompt_preview).toContain('token=[REDACTED]');
        expect(rows[0].response_preview).toBe('Logged answer');
        const filtered = interactionStore.listInteractions({ caller: 'src/test-caller.ts:12', success: true });
        expect(filtered).toHaveLength(1);
        expect(interactionStore.getInteractionCount()).toBe(1);
    });
    it('honors the KEET_INTERACTION_LOGGING kill switch', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keet-interactions-off-'));
        const dbPath = path.join(tempDir, 'messages.db');
        const { interactionStore, llmRouter } = await loadRouterModules(false);
        interactionStore.setInteractionStorePathForTests(dbPath);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Should not persist' } }],
                usage: { prompt_tokens: 5, completion_tokens: 3 },
            }),
        }));
        await llmRouter.runLlm({
            caller: 'src/test-caller.ts:99',
            messages: [{ role: 'user', content: 'Hello' }],
            routes: [{ provider: 'openrouter', model: 'gpt-4o-mini' }],
        });
        expect(interactionStore.listInteractions({ limit: 10 })).toHaveLength(0);
        expect(interactionStore.getInteractionCount()).toBe(0);
    });
});
//# sourceMappingURL=interaction-store.test.js.map