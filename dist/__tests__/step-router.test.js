import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../keet-provider-config.js', () => ({
    resolveEffectiveOllamaModel: vi.fn((model) => ({
        model,
        authority: 'legacy',
        warnings: [],
    })),
    resolveEffectiveProviderModel: vi.fn((_providerId, model) => ({
        model,
        authority: 'legacy',
        warnings: [],
    })),
}));
import { decideStepRouting } from '../step-router.js';
describe('decideStepRouting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.OPENROUTER_MODEL;
        delete process.env.PRO_BRAIN_MODEL;
        delete process.env.OLLAMA_MODEL;
        delete process.env.OLLAMA_CHAT_MODEL;
    });
    it('uses provider-compatible defaults for standard mode', () => {
        const decision = decideStepRouting({
            step: 1,
            description: 'Inspect the repo and summarize the result',
            tool: 'bash',
            dependsOn: [],
            estimatedMs: 1000,
        }, {
            requested_mode: null,
            effective_mode: 'standard',
            source: 'chat_default',
            inline_override: null,
            clean_content: 'inspect the repo',
            lane: 'keet_execution',
        }, 1);
        expect(decision.provider).toBe('openrouter');
        expect(decision.model).toBe('qwen/qwen3-coder-flash');
        expect(decision.escalation_target).toEqual({
            provider: 'claude',
            model: 'claude-sonnet-4-6',
        });
    });
    it('uses a Claude model for pro mode', () => {
        const decision = decideStepRouting({
            step: 1,
            description: 'Review the deployment change',
            tool: 'bash',
            dependsOn: [],
            estimatedMs: 1000,
            risk_level: 'high',
        }, {
            requested_mode: 'pro',
            effective_mode: 'pro',
            source: 'inline_override',
            inline_override: 'pro',
            clean_content: 'review the deployment change',
            lane: 'keet_execution',
        }, 1);
        expect(decision.provider).toBe('claude');
        expect(decision.model).toBe('claude-sonnet-4-6');
    });
});
//# sourceMappingURL=step-router.test.js.map