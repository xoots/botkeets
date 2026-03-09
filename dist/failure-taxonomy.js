import { logger } from './logger.js';
export const RECOVERY_POLICY = {
    classification_error: { strategy: 'retry_with_default', default_intent: 'chat' },
    direct_path_unhandled: { strategy: 'promote_to_container' },
    plan_generation_failed: { strategy: 'autonomous_without_plan' },
    clarification_resume_failed: { strategy: 'promote_to_container' },
    execution_timeout: { strategy: 'escalate_to_user', message: 'Task timed out. Check workspace for partial progress.' },
    execution_error: { strategy: 'escalate_to_user', message: 'Task execution failed unexpectedly.' },
    budget_exceeded: { strategy: 'pause_and_notify', message: 'Budget limit reached.' },
    provider_exhausted: { strategy: 'queue_for_retry', delay_ms: 60_000 },
    workspace_corruption: { strategy: 'escalate_to_user', message: 'Workspace is corrupted. Manual intervention needed.' },
    overseer_chain_exhausted: { strategy: 'escalate_to_user', message: 'Could not evaluate task result — all evaluation models unavailable.' },
    input_validation_failed: { strategy: 'retry_with_default', default_intent: 'chat' },
    unknown: { strategy: 'escalate_to_user', message: 'Unknown error occurred.' },
};
/**
 * Categorize an error into a FailureCategory based on error shape and context.
 *
 * IMPORTANT: This handles two types of failures:
 * 1. Error-based failures (caught by catch blocks) — pass the caught error.
 * 2. Outcome-based failures (function returned non-success) — pass null as error
 *    and use the `outcomeCategory` field in context to specify the category directly.
 *    Example: direct_path_unhandled is NOT an error — runDirectForGroup() returned
 *    { handled: false }, which is expected behavior that triggers container promotion.
 */
export function categorizeFailure(error, context) {
    // Outcome-based failures first (no error thrown)
    if (context.outcomeCategory) {
        const category = context.outcomeCategory;
        logger.warn({ category, phase: context.phase, groupJid: context.groupJid }, `Failure categorized: ${category}`);
        return { category, recovery: RECOVERY_POLICY[category], originalError: error, context };
    }
    const msg = String(error);
    let category;
    // Pattern-based matching on error message
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        category = 'execution_timeout';
    }
    else if (msg.includes('BUDGET') || msg.includes('budget') || msg.includes('CONTEXT_HARD_STOP')) {
        category = 'budget_exceeded';
    }
    else if (msg.includes('All overseer providers exhausted')) {
        category = 'overseer_chain_exhausted';
    }
    else if (msg.includes('ENOENT') || (msg.includes('workspace') && msg.includes('not found'))) {
        category = 'workspace_corruption';
    }
    else if (msg.includes('schema validation failed') || msg.includes('hardening:') || msg.includes('input_validation_failed')) {
        category = 'input_validation_failed';
    }
    else {
        // Phase-based fallback
        switch (context.phase) {
            case 'intake':
                category = 'classification_error';
                break;
            case 'approval':
                category = 'plan_generation_failed';
                break;
            case 'execution':
                category = 'execution_error';
                break;
            case 'overseer':
                category = 'overseer_chain_exhausted';
                break;
            default:
                category = 'unknown';
                break;
        }
    }
    logger.warn({ category, phase: context.phase, groupJid: context.groupJid, error_message: msg.slice(0, 200) }, `Failure categorized: ${category}`);
    return { category, recovery: RECOVERY_POLICY[category], originalError: error, context };
}
/**
 * Execute the recovery action for a categorized failure.
 * Returns true if recovery was handled (caller should not fall through).
 * Returns false if caller should continue with default behavior.
 */
export async function executeRecovery(failure, handlers) {
    const { recovery } = failure;
    switch (recovery.strategy) {
        case 'promote_to_container':
            return await handlers.promoteToContainer();
        case 'retry_with_default':
            return await handlers.retryWithDefault(recovery.default_intent);
        case 'autonomous_without_plan':
            return await handlers.autonomousWithoutPlan();
        case 'escalate_to_user':
            await handlers.escalateToUser(recovery.message);
            return true;
        case 'pause_and_notify':
            await handlers.pauseAndNotify(recovery.message);
            return true;
        case 'queue_for_retry':
            await handlers.queueForRetry(recovery.delay_ms);
            return true;
        case 'log_and_continue':
            return false;
    }
}
//# sourceMappingURL=failure-taxonomy.js.map