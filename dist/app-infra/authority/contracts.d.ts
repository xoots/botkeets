import type { BudgetBlockedReason, BudgetPolicy, TaskSpendState } from '../../budget-policy.js';
import type { EffectiveRoutingMode } from '../../execution-routing.js';
export type AuthorityActorRole = 'keet-agent' | 'infra-admin' | 'infra-service' | 'viewer';
export interface AuthorityActor {
    id: string;
    role: AuthorityActorRole;
}
export type AuthorityAction = 'can_execute' | 'approve_pro_shard' | 'update_budget_policy' | 'update_task_budget';
export type AuthorityDecisionReason = BudgetBlockedReason | 'awaiting_pro_shard_approval' | 'max_calls_exceeded' | 'pro_shard_limit_exceeded' | 'rbac_denied' | 'allowed';
export interface TaskStartProposal {
    taskId: string;
    mode: EffectiveRoutingMode;
    proposedShardCount: number;
    requestedMaxCalls: number;
}
export interface TaskStartDecision {
    allowed: boolean;
    reason: AuthorityDecisionReason;
    enforcedMaxCalls: number;
}
export interface CanExecuteProposal {
    taskId: string;
    mode: EffectiveRoutingMode;
    shardId: string;
    provider: string;
    isEscalated: boolean;
    proposedCallCount: number;
    enforcedMaxCalls: number;
}
export interface CanExecuteDecision {
    allowed: boolean;
    reason: AuthorityDecisionReason;
    expectedUsd?: number;
}
export interface PolicyMutationDecision {
    allowed: boolean;
    reason: AuthorityDecisionReason;
    policy: BudgetPolicy | null;
}
export interface AuthorityDeps {
    nowImpl: () => Date;
    getBudgetPolicyImpl: () => BudgetPolicy;
    updateBudgetPolicyImpl: (patch: Partial<BudgetPolicy>) => BudgetPolicy;
    evaluateBudgetImpl: (args: {
        taskId: string;
        mode: EffectiveRoutingMode;
        shardId: string;
        provider: string;
        isEscalated: boolean;
    }) => {
        allowed: boolean;
        reason?: BudgetBlockedReason;
        expectedUsd: number;
    };
    recordSpendImpl: (args: {
        taskId: string;
        mode: EffectiveRoutingMode;
        shardId: string;
        provider: string;
        isEscalated: boolean;
        explicitUsd?: number;
    }) => {
        addedUsd: number;
        task: TaskSpendState;
    };
    getProShardApprovalImpl: (taskId: string) => {
        approved: boolean;
    } | null;
    approveShardImpl: (taskId: string, note?: string) => {
        approval: {
            taskId: string;
            approved: boolean;
            decidedAt: string;
            note?: string;
        };
        alert_file: string | null;
    };
    canRolePerformImpl: (role: AuthorityActorRole, action: AuthorityAction) => boolean;
    emitAuditDecisionImpl: (event: {
        actor: AuthorityActor;
        action: AuthorityAction;
        target: string;
        allowed: boolean;
        reason: AuthorityDecisionReason;
        details?: Record<string, unknown>;
    }) => void;
}
//# sourceMappingURL=contracts.d.ts.map