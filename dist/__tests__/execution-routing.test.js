import { describe, expect, it, vi } from 'vitest';
vi.mock('../config.js', () => ({
    ASSISTANT_NAME: 'Andy',
}));
vi.mock('../mode-manager.js', () => ({
    getMode: vi.fn(() => 'standard'),
}));
import { hasAssistantTrigger, normalizeRoutingInput, resolveExecutionRoutingContext, } from '../execution-routing.js';
describe('execution routing trigger normalization', () => {
    it('parses a mode override after the assistant trigger', () => {
        const routing = resolveExecutionRoutingContext('tg:test', '@Andy !pro review the launch regression', 'standard');
        expect(routing.requested_mode).toBe('pro');
        expect(routing.effective_mode).toBe('pro');
        expect(routing.inline_override).toBe('pro');
        expect(routing.clean_content).toBe('review the launch regression');
    });
    it('strips Telegram bot mentions that precede a mode override', () => {
        expect(normalizeRoutingInput('@Andy @andy_ai_bot !pro review the launch regression')).toBe('!pro review the launch regression');
    });
    it('accepts repeated leading mentions before a mode override in the first message', () => {
        const routing = resolveExecutionRoutingContext('tg:test', '@Andy @andy_ai_bot @helper_bot !pro review the launch regression', 'standard');
        expect(routing.requested_mode).toBe('pro');
        expect(routing.effective_mode).toBe('pro');
        expect(routing.inline_override).toBe('pro');
        expect(routing.clean_content).toBe('review the launch regression');
    });
    it('accepts a mode override before the assistant trigger', () => {
        expect(hasAssistantTrigger('!pro @Andy review the launch regression')).toBe(true);
        const routing = resolveExecutionRoutingContext('tg:test', '!pro @Andy review the launch regression', 'standard');
        expect(routing.requested_mode).toBe('pro');
        expect(routing.effective_mode).toBe('pro');
        expect(routing.inline_override).toBe('pro');
        expect(routing.clean_content).toBe('review the launch regression');
    });
    it('removes the leading trigger even when no override is present', () => {
        const routing = resolveExecutionRoutingContext('tg:test', '@Andy inspect the repo and summarize the blockers', 'standard');
        expect(routing.effective_mode).toBe('standard');
        expect(routing.inline_override).toBeNull();
        expect(routing.clean_content).toBe('inspect the repo and summarize the blockers');
    });
});
//# sourceMappingURL=execution-routing.test.js.map