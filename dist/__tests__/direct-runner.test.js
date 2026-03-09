import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../router.js', () => ({
    formatMessages: vi.fn((messages) => messages.map((message) => message.content).join('\n')),
    formatOutbound: vi.fn((text) => text),
}));
vi.mock('../provider-strategy.js', () => ({
    isRateLimitError: vi.fn(() => false),
    isOllamaAvailable: vi.fn(() => true),
    deactivateProvider: vi.fn(),
}));
vi.mock(import('../config.js'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ASSISTANT_NAME: 'keet',
        CLAUDE_API_KEY: '',
        CLAUDE_CODE_OAUTH_TOKEN: '',
        OPENROUTER_API_KEY: '',
        DASHSCOPE_API_KEY: 'dashscope-test-key',
        DASHSCOPE_BASE_URL: 'https://dashscope.test',
        DEEPSEEK_API_KEY: '',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        OLLAMA_HOST: 'http://ollama.test',
        COPAW_ENABLED: false,
    };
});
vi.mock('../mode-router.js', () => ({
    routeMessage: vi.fn(async () => ({
        provider: 'dashscope',
        model: 'qwen3.5-plus',
        fallbacks: [],
        needsWebSearch: false,
        needsContainer: false,
        resolvedMode: 'eco',
        classification: { task_type: 'chat' },
    })),
}));
vi.mock('../web-search.js', () => ({
    webSearch: vi.fn(),
    formatSearchResults: vi.fn(() => ''),
}));
vi.mock('../execution-routing.js', () => ({
    resolveExecutionLaneDecision: vi.fn(() => ({
        lane: 'keet_execution',
        reason: 'standalone_direct',
        copaw_eligible: false,
    })),
}));
vi.mock('../keet-provider-config.js', () => ({
    getKeetProviderCapability: vi.fn(() => ({ compatible_with_keet: true })),
    resolveEffectiveOllamaBaseUrl: vi.fn(() => ({ base_url: 'http://ollama.test' })),
    resolveEffectiveProviderCredential: vi.fn((_provider, apiKey, baseUrl) => ({
        api_key: apiKey,
        base_url: baseUrl,
    })),
}));
vi.mock('../copaw-lane-bridge.js', () => ({
    executeCoPawLane: vi.fn(),
    getCoPawLaneHealth: vi.fn(() => ({ circuit_open: false })),
}));
vi.mock('../execution-run-history.js', () => ({
    appendExecutionRunHistory: vi.fn(),
}));
vi.mock('../runtime-split.js', () => ({
    markCoPawBridgeFailure: vi.fn(),
    markLaneFallback: vi.fn(),
    markLaneRun: vi.fn(),
}));
vi.mock('../hardening-schemas.js', () => ({
    sanitizeInput: vi.fn((value) => value),
}));
vi.mock('../claude-text-executor.js', () => ({
    executeClaudeTextPrompt: vi.fn(),
}));
import { runDirectForGroup } from '../direct-runner.js';
import { markLaneRun } from '../runtime-split.js';
describe('runDirectForGroup()', () => {
    const channel = {
        sendMessage: vi.fn(async () => { }),
        setTyping: vi.fn(async () => { }),
    };
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                choices: [
                    { message: { content: 'Direct path response' } },
                ],
            }),
            text: async () => '',
        })));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });
    it('handles a standalone direct-path request without container fallback', async () => {
        const result = await runDirectForGroup('tg:123', channel, [
            {
                id: 'm1',
                content: 'hello there',
                sender: 'user',
                sender_name: 'User',
                chat_jid: 'tg:123',
                timestamp: '2026-03-08T00:00:00.000Z',
                is_from_me: false,
                is_bot_message: false,
            },
        ], 'chat', {
            requested_mode: null,
            effective_mode: 'eco',
            source: 'chat_default',
            inline_override: null,
            clean_content: 'hello there',
            lane: 'keet_execution',
            lane_reason: 'standalone_direct',
        });
        expect(result).toEqual({ handled: true, lane_used: 'keet', fallback_reason: undefined });
        expect(channel.sendMessage).toHaveBeenCalledWith('tg:123', 'Direct path response');
        expect(markLaneRun).toHaveBeenCalledWith('keet_execution');
    });
});
//# sourceMappingURL=direct-runner.test.js.map