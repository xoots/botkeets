import { describe, it, expect, vi, beforeEach } from 'vitest';
import { categorizeFailure, executeRecovery, RECOVERY_POLICY, } from '../failure-taxonomy.js';
vi.mock('../logger.js', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
describe('categorizeFailure()', () => {
    it('timeout error → execution_timeout', () => {
        const f = categorizeFailure(new Error('connection timeout'), { phase: 'execution', groupJid: 'g1' });
        expect(f.category).toBe('execution_timeout');
        expect(f.recovery.strategy).toBe('escalate_to_user');
    });
    it('ETIMEDOUT error → execution_timeout', () => {
        const f = categorizeFailure(new Error('ETIMEDOUT'), { phase: 'execution', groupJid: 'g1' });
        expect(f.category).toBe('execution_timeout');
    });
    it('BUDGET error → budget_exceeded', () => {
        const f = categorizeFailure(new Error('BUDGET_EXCEEDED: call limit'), { phase: 'execution', groupJid: 'g1' });
        expect(f.category).toBe('budget_exceeded');
        expect(f.recovery.strategy).toBe('pause_and_notify');
    });
    it('CONTEXT_HARD_STOP error → budget_exceeded', () => {
        const f = categorizeFailure(new Error('CONTEXT_HARD_STOP exceeded'), { phase: 'execution', groupJid: 'g1' });
        expect(f.category).toBe('budget_exceeded');
    });
    it('ENOENT error → workspace_corruption', () => {
        const f = categorizeFailure(new Error('ENOENT: no such file'), { phase: 'execution', groupJid: 'g1' });
        expect(f.category).toBe('workspace_corruption');
        expect(f.recovery.strategy).toBe('escalate_to_user');
    });
    it('unknown error + intake phase → classification_error', () => {
        const f = categorizeFailure(new Error('some random error'), { phase: 'intake', groupJid: 'g1' });
        expect(f.category).toBe('classification_error');
        expect(f.recovery.strategy).toBe('retry_with_default');
    });
    it('unknown error + execution phase → execution_error', () => {
        const f = categorizeFailure(new Error('some random error'), { phase: 'execution', groupJid: 'g1' });
        expect(f.category).toBe('execution_error');
        expect(f.recovery.strategy).toBe('escalate_to_user');
    });
    it('outcomeCategory bypasses error pattern matching', () => {
        const f = categorizeFailure(null, {
            phase: 'intake', groupJid: 'g1', outcomeCategory: 'direct_path_unhandled',
        });
        expect(f.category).toBe('direct_path_unhandled');
        expect(f.recovery.strategy).toBe('promote_to_container');
    });
    it('All overseer providers exhausted → overseer_chain_exhausted', () => {
        const f = categorizeFailure(new Error('All overseer providers exhausted'), { phase: 'overseer', groupJid: 'g1' });
        expect(f.category).toBe('overseer_chain_exhausted');
    });
    it('schema validation error → input_validation_failed', () => {
        const f = categorizeFailure(new Error('schema validation failed — using fallback'), { phase: 'intake', groupJid: 'g1' });
        expect(f.category).toBe('input_validation_failed');
        expect(f.recovery.strategy).toBe('retry_with_default');
    });
    it('hardening error → input_validation_failed', () => {
        const f = categorizeFailure(new Error('hardening: rejected invalid projectId'), { phase: 'execution', groupJid: 'g1' });
        expect(f.category).toBe('input_validation_failed');
        expect(f.recovery.strategy).toBe('retry_with_default');
    });
});
describe('RECOVERY_POLICY completeness', () => {
    it('has an entry for every FailureCategory — adding a new category without a policy is a type error', () => {
        const categories = [
            'classification_error',
            'direct_path_unhandled',
            'plan_generation_failed',
            'clarification_resume_failed',
            'execution_timeout',
            'execution_error',
            'budget_exceeded',
            'provider_exhausted',
            'workspace_corruption',
            'overseer_chain_exhausted',
            'input_validation_failed',
            'unknown',
        ];
        for (const cat of categories) {
            expect(RECOVERY_POLICY[cat]).toBeDefined();
            expect(RECOVERY_POLICY[cat].strategy).toBeTruthy();
        }
        // All 12 categories should be present
        expect(Object.keys(RECOVERY_POLICY).length).toBe(12);
    });
});
describe('executeRecovery()', () => {
    let handlers;
    beforeEach(() => {
        handlers = {
            promoteToContainer: vi.fn().mockResolvedValue(true),
            retryWithDefault: vi.fn().mockResolvedValue(true),
            autonomousWithoutPlan: vi.fn().mockResolvedValue(true),
            escalateToUser: vi.fn().mockResolvedValue(undefined),
            pauseAndNotify: vi.fn().mockResolvedValue(undefined),
            queueForRetry: vi.fn().mockResolvedValue(undefined),
        };
    });
    it('escalate_to_user → calls escalateToUser and returns true', async () => {
        const f = categorizeFailure(new Error('exec error'), { phase: 'execution', groupJid: 'g1' });
        f.recovery = { strategy: 'escalate_to_user', message: 'test message' };
        const result = await executeRecovery(f, handlers);
        expect(handlers.escalateToUser).toHaveBeenCalledWith('test message');
        expect(result).toBe(true);
    });
    it('promote_to_container → calls promoteToContainer and returns its value', async () => {
        const f = categorizeFailure(null, {
            phase: 'intake', groupJid: 'g1', outcomeCategory: 'direct_path_unhandled',
        });
        const result = await executeRecovery(f, handlers);
        expect(handlers.promoteToContainer).toHaveBeenCalled();
        expect(result).toBe(true);
    });
    it('queue_for_retry → calls queueForRetry with correct delay and returns true', async () => {
        const f = categorizeFailure(new Error('provider down'), { phase: 'execution', groupJid: 'g1' });
        f.recovery = { strategy: 'queue_for_retry', delay_ms: 60_000 };
        const result = await executeRecovery(f, handlers);
        expect(handlers.queueForRetry).toHaveBeenCalledWith(60_000);
        expect(result).toBe(true);
    });
    it('pause_and_notify → calls pauseAndNotify and returns true', async () => {
        const f = categorizeFailure(new Error('budget'), { phase: 'execution', groupJid: 'g1' });
        f.recovery = { strategy: 'pause_and_notify', message: 'Budget limit reached.' };
        const result = await executeRecovery(f, handlers);
        expect(handlers.pauseAndNotify).toHaveBeenCalledWith('Budget limit reached.');
        expect(result).toBe(true);
    });
    it('retry_with_default → calls retryWithDefault with the intent and returns its value', async () => {
        const f = categorizeFailure(new Error('classify error'), { phase: 'intake', groupJid: 'g1' });
        f.recovery = { strategy: 'retry_with_default', default_intent: 'chat' };
        const result = await executeRecovery(f, handlers);
        expect(handlers.retryWithDefault).toHaveBeenCalledWith('chat');
        expect(result).toBe(true);
    });
    it('log_and_continue → returns false without calling any handler', async () => {
        const f = categorizeFailure(new Error('non-critical'), { phase: 'intake', groupJid: 'g1' });
        f.recovery = { strategy: 'log_and_continue' };
        const result = await executeRecovery(f, handlers);
        expect(result).toBe(false);
        expect(handlers.promoteToContainer).not.toHaveBeenCalled();
        expect(handlers.escalateToUser).not.toHaveBeenCalled();
    });
});
describe('RECOVERY_POLICY completeness', () => {
    it('has recovery for input_validation_failed', () => {
        expect(RECOVERY_POLICY.input_validation_failed).toBeDefined();
        expect(RECOVERY_POLICY.input_validation_failed.strategy).toBe('retry_with_default');
    });
});
//# sourceMappingURL=failure-taxonomy.test.js.map