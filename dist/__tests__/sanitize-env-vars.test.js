import { describe, expect, it } from 'vitest';
import { sanitizeEnvVars } from '../sanitize-env-vars.js';
describe('sanitizeEnvVars', () => {
    it('strips unsafe env keys', () => {
        const result = sanitizeEnvVars({
            OPENROUTER_API_KEY: 'ok',
            PATH: '/tmp/evil',
            NODE_OPTIONS: '--require /tmp/hook.js',
            EXTRA_SECRET: 'drop-me',
        }, { allowedKeys: ['OPENROUTER_API_KEY', 'PATH', 'NODE_OPTIONS'] });
        expect(result.envVars).toEqual({ OPENROUTER_API_KEY: 'ok' });
        expect(result.rejectedKeys).toEqual([
            { key: 'PATH', reason: 'reserved' },
            { key: 'NODE_OPTIONS', reason: 'reserved' },
            { key: 'EXTRA_SECRET', reason: 'not_allowed' },
        ]);
    });
    it('keeps explicitly allowed safe env keys', () => {
        const result = sanitizeEnvVars({
            USER_ID: '501',
            GROUP_ID: '20',
            OLLAMA_HOST: 'http://127.0.0.1:11434',
        }, { allowedKeys: ['USER_ID', 'GROUP_ID', 'OLLAMA_HOST'] });
        expect(result.envVars).toEqual({
            USER_ID: '501',
            GROUP_ID: '20',
            OLLAMA_HOST: 'http://127.0.0.1:11434',
        });
        expect(result.rejectedKeys).toEqual([]);
    });
});
//# sourceMappingURL=sanitize-env-vars.test.js.map