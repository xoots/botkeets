import { getOrInitTaskSpend, } from '../../budget-policy.js';
import { canRolePerform } from './rbac.js';
import { emitAuditDecision } from './audit-pipeline.js';
import { BudgetLedgerService } from './budget-ledger-service.js';
import { PolicyApi } from './policy-api.js';
import { ApprovalGate } from './approval-gate.js';
function deny(actor, action, target, reason, emitAudit, details) {
    emitAudit({
        actor,
        action,
        target,
        allowed: false,
        reason,
        details,
    });
    return { allowed: false, reason };
}
export class PlatformAuthorityService {
    deps;
    budgetLedger;
    policyApi;
    approvalGate;
    constructor(deps = {}, services = {}) {
        this.budgetLedger = services.budgetLedger ?? new BudgetLedgerService();
        this.policyApi = services.policyApi ?? new PolicyApi();
        this.approvalGate = services.approvalGate ?? new ApprovalGate();
        this.deps = {
            nowImpl: () => new Date(),
            getBudgetPolicyImpl: () => this.policyApi.getPolicy(),
            updateBudgetPolicyImpl: (patch) => this.policyApi.updatePolicy(patch),
            evaluateBudgetImpl: (args) => this.budgetLedger.canExecute(args),
            recordSpendImpl: (args) => this.budgetLedger.recordApprovedSpend(args),
            getProShardApprovalImpl: (taskId) => (this.approvalGate.isProApproved(taskId) ? { approved: true } : null),
            approveShardImpl: (taskId, note) => this.approvalGate.approve(taskId, note),
            canRolePerformImpl: canRolePerform,
            emitAuditDecisionImpl: emitAuditDecision,
            ...deps,
        };
    }
    authorizeTaskStart(actor, proposal) {
        if (!this.deps.canRolePerformImpl(actor.role, 'can_execute')) {
            deny(actor, 'can_execute', proposal.taskId, 'rbac_denied', this.deps.emitAuditDecisionImpl, proposal);
            return { allowed: false, reason: 'rbac_denied', enforcedMaxCalls: proposal.requestedMaxCalls };
        }
        const policy = this.deps.getBudgetPolicyImpl();
        const enforcedMaxCalls = proposal.mode === 'pro'
            ? Math.min(proposal.requestedMaxCalls, policy.pro.max_calls_per_task)
            : proposal.requestedMaxCalls;
        if (proposal.mode === 'pro') {
            if (proposal.proposedShardCount > policy.pro.max_shards_per_task) {
                deny(actor, 'can_execute', proposal.taskId, 'pro_shard_limit_exceeded', this.deps.emitAuditDecisionImpl, {
                    proposedShardCount: proposal.proposedShardCount,
                    maxShardsPerTask: policy.pro.max_shards_per_task,
                });
                return { allowed: false, reason: 'pro_shard_limit_exceeded', enforcedMaxCalls };
            }
            if (policy.pro.shard_strategy === 'manual_approval' && !this.deps.getProShardApprovalImpl(proposal.taskId)?.approved) {
                deny(actor, 'can_execute', proposal.taskId, 'awaiting_pro_shard_approval', this.deps.emitAuditDecisionImpl, {
                    shardStrategy: policy.pro.shard_strategy,
                });
                return { allowed: false, reason: 'awaiting_pro_shard_approval', enforcedMaxCalls };
            }
        }
        this.deps.emitAuditDecisionImpl({
            actor,
            action: 'can_execute',
            target: proposal.taskId,
            allowed: true,
            reason: 'allowed',
            details: {
                mode: proposal.mode,
                proposedShardCount: proposal.proposedShardCount,
                requestedMaxCalls: proposal.requestedMaxCalls,
                enforcedMaxCalls,
            },
        });
        return { allowed: true, reason: 'allowed', enforcedMaxCalls };
    }
    authorizeCanExecute(actor, proposal) {
        if (!this.deps.canRolePerformImpl(actor.role, 'can_execute')) {
            deny(actor, 'can_execute', proposal.taskId, 'rbac_denied', this.deps.emitAuditDecisionImpl, proposal);
            return { allowed: false, reason: 'rbac_denied' };
        }
        if (proposal.proposedCallCount > proposal.enforcedMaxCalls) {
            deny(actor, 'can_execute', proposal.taskId, 'max_calls_exceeded', this.deps.emitAuditDecisionImpl, {
                proposedCallCount: proposal.proposedCallCount,
                enforcedMaxCalls: proposal.enforcedMaxCalls,
            });
            return { allowed: false, reason: 'max_calls_exceeded' };
        }
        const budget = this.deps.evaluateBudgetImpl({
            taskId: proposal.taskId,
            mode: proposal.mode,
            shardId: proposal.shardId,
            provider: proposal.provider,
            isEscalated: proposal.isEscalated,
        });
        if (!budget.allowed) {
            const reason = budget.reason ?? 'blocked_budget_task';
            deny(actor, 'can_execute', proposal.taskId, reason, this.deps.emitAuditDecisionImpl, {
                ...proposal,
                expectedUsd: budget.expectedUsd,
            });
            return { allowed: false, reason, expectedUsd: budget.expectedUsd };
        }
        this.deps.emitAuditDecisionImpl({
            actor,
            action: 'can_execute',
            target: proposal.taskId,
            allowed: true,
            reason: 'allowed',
            details: {
                ...proposal,
                expectedUsd: budget.expectedUsd,
            },
        });
        return { allowed: true, reason: 'allowed', expectedUsd: budget.expectedUsd };
    }
    recordApprovedSpend(args) {
        this.deps.recordSpendImpl(args);
    }
    approveProShard(actor, taskId, note) {
        if (!this.deps.canRolePerformImpl(actor.role, 'approve_pro_shard')) {
            deny(actor, 'approve_pro_shard', taskId, 'rbac_denied', this.deps.emitAuditDecisionImpl, { note: note ?? '' });
            return {
                allowed: false,
                reason: 'rbac_denied',
                approval: null,
            };
        }
        const result = this.deps.approveShardImpl(taskId, note);
        this.deps.emitAuditDecisionImpl({
            actor,
            action: 'approve_pro_shard',
            target: taskId,
            allowed: true,
            reason: 'allowed',
            details: {
                note: note ?? '',
                approved: result.approval.approved,
                decidedAt: result.approval.decidedAt,
            },
        });
        return {
            allowed: true,
            reason: 'allowed',
            approval: result.approval,
            alert_file: result.alert_file,
        };
    }
    authorizePolicyMutation(actor, action, patch) {
        if (!this.deps.canRolePerformImpl(actor.role, action)) {
            deny(actor, action, 'budget-policy', 'rbac_denied', this.deps.emitAuditDecisionImpl, patch);
            return { allowed: false, reason: 'rbac_denied', policy: null };
        }
        const policy = this.deps.updateBudgetPolicyImpl(patch);
        this.deps.emitAuditDecisionImpl({
            actor,
            action,
            target: 'budget-policy',
            allowed: true,
            reason: 'allowed',
            details: patch,
        });
        return { allowed: true, reason: 'allowed', policy };
    }
    getTaskSpend(taskId, mode) {
        return getOrInitTaskSpend(taskId, mode);
    }
}
export const platformAuthorityService = new PlatformAuthorityService();
//# sourceMappingURL=platform-authority-service.js.map