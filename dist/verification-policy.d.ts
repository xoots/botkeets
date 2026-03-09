export type VerificationSeverity = 'pass' | 'warn' | 'fail';
export interface VerificationCheck {
    name: string;
    severity: VerificationSeverity;
    message: string;
}
export interface VerificationReport {
    checks: VerificationCheck[];
    passed: boolean;
    /** Overall summary for overseer context enrichment */
    summary: string;
    /** Suggest reprompt if fixable failures detected */
    suggestedAction: 'proceed' | 'reprompt' | 'escalate';
    /** If reprompt, what to tell the agent to fix */
    repromptHint?: string;
}
/**
 * Run verification checks on a completed task workspace.
 * Called after runTask() succeeds, before PR creation.
 */
export declare function verifyTaskOutput(workspaceDir: string, taskSummary: string, taskOutputs: string[]): Promise<VerificationReport>;
//# sourceMappingURL=verification-policy.d.ts.map