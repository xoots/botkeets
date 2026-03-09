import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../keet-provider-config.js', () => ({
    resolveEffectiveOllamaBaseUrl: vi.fn(() => ({ base_url: 'http://ollama.test' })),
}));
vi.mock('../memory-signal-emitter.js', () => ({
    emitSignal: vi.fn(),
}));
vi.mock('../memory-project-resolver.js', () => ({
    resolveProjectIdFromContent: vi.fn(() => null),
}));
vi.mock('../db.js', () => ({
    appendTaskEmbedding: vi.fn(),
}));
import { classifyTask } from '../task-classifier.js';
describe('classifyTask()', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('classifier unavailable')));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });
    it('falls back to rule-based classification when sidecar and local classifier are unavailable', async () => {
        const result = await classifyTask('What is the weather today?');
        expect(result.usedFallback).toBe(true);
        expect(result.task_type).toBe('research');
        expect(result.recommended_mode).toBe('standard');
    });
});
//# sourceMappingURL=task-classifier.test.js.map