import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock(import('../config.js'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        CLAUDE_CODE_OAUTH_TOKEN: 'oauth-test-token',
    };
});
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import * as claudeTextExecutor from '../claude-text-executor.js';
describe('executeClaudeTextPrompt()', () => {
    beforeEach(() => {
        claudeTextExecutor.resetClaudeTextExecutorForTests();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it('runs the OAuth smoke test once before direct text calls', async () => {
        const query = vi.fn()
            .mockImplementationOnce(() => ({
            async *[Symbol.asyncIterator]() {
                yield { type: 'result', subtype: 'success', result: 'OK' };
            },
            close: vi.fn(),
        }))
            .mockImplementationOnce(() => ({
            async *[Symbol.asyncIterator]() {
                yield { type: 'result', subtype: 'success', result: 'Real response one' };
            },
            close: vi.fn(),
        }))
            .mockImplementationOnce(() => ({
            async *[Symbol.asyncIterator]() {
                yield { type: 'result', subtype: 'success', result: 'Real response two' };
            },
            close: vi.fn(),
        }));
        claudeTextExecutor.setClaudeAgentSdkLoaderForTests(async () => ({ query }));
        const first = await claudeTextExecutor.executeClaudeTextPrompt({
            prompt: 'first',
            workspaceDir: process.cwd(),
            model: 'claude-sonnet-4-6',
            settingSources: [],
        });
        const second = await claudeTextExecutor.executeClaudeTextPrompt({
            prompt: 'second',
            workspaceDir: process.cwd(),
            model: 'claude-sonnet-4-6',
            settingSources: [],
        });
        expect(first).toBe('Real response one');
        expect(second).toBe('Real response two');
        expect(query).toHaveBeenCalledTimes(3);
    });
    it('surfaces a clear OAuth error when the smoke test fails', async () => {
        const query = vi.fn().mockImplementationOnce(() => ({
            async *[Symbol.asyncIterator]() {
                throw new Error('invalid oauth token');
            },
            close: vi.fn(),
        }));
        claudeTextExecutor.setClaudeAgentSdkLoaderForTests(async () => ({ query }));
        await expect(claudeTextExecutor.executeClaudeTextPrompt({
            prompt: 'first',
            workspaceDir: process.cwd(),
            model: 'claude-sonnet-4-6',
            settingSources: [],
        })).rejects.toThrow('Claude OAuth smoke test failed');
    });
});
//# sourceMappingURL=claude-text-executor.test.js.map