/**
 * Every failure in the pipeline falls into one of these categories.
 * Each category has a defined recovery action.
 */
export type FailureCategory = 'classification_error' | 'direct_path_unhandled' | 'plan_generation_failed' | 'clarification_resume_failed' | 'execution_timeout' | 'execution_error' | 'budget_exceeded' | 'provider_exhausted' | 'workspace_corruption' | 'overseer_chain_exhausted' | 'input_validation_failed' | 'unknown';
export type RecoveryAction = {
    strategy: 'promote_to_container';
} | {
    strategy: 'retry_with_default';
    default_intent: string;
} | {
    strategy: 'autonomous_without_plan';
} | {
    strategy: 'escalate_to_user';
    message: string;
} | {
    strategy: 'pause_and_notify';
    message: string;
} | {
    strategy: 'queue_for_retry';
    delay_ms: number;
} | {
    strategy: 'log_and_continue';
};
export declare const RECOVERY_POLICY: Record<FailureCategory, RecoveryAction>;
export interface CategorizedFailure {
    category: FailureCategory;
    recovery: RecoveryAction;
    originalError: unknown;
    context: Record<string, unknown>;
}
export interface RecoveryHandlers {
    promoteToContainer: () => Promise<boolean>;
    retryWithDefault: (intent: string) => Promise<boolean>;
    autonomousWithoutPlan: () => Promise<boolean>;
    escalateToUser: (message: string) => Promise<void>;
    pauseAndNotify: (message: string) => Promise<void>;
    queueForRetry: (delayMs: number) => Promise<void>;
}
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
export declare function categorizeFailure(error: unknown, context: {
    phase: 'intake' | 'approval' | 'execution' | 'overseer' | 'container';
    groupJid: string;
    /** For outcome-based failures (not errors), specify the category directly */
    outcomeCategory?: FailureCategory;
}): CategorizedFailure;
/**
 * Execute the recovery action for a categorized failure.
 * Returns true if recovery was handled (caller should not fall through).
 * Returns false if caller should continue with default behavior.
 */
export declare function executeRecovery(failure: CategorizedFailure, handlers: RecoveryHandlers): Promise<boolean>;
//# sourceMappingURL=failure-taxonomy.d.ts.map