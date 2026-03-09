import { BudgetLedgerService } from './budget-ledger-service.js';
import { PolicyApi } from './policy-api.js';
import { ApprovalGate } from './approval-gate.js';
import { AuthorityActor, AuthorityDeps, CanExecuteDecision, CanExecuteProposal, PolicyMutationDecision, TaskStartDecision, TaskStartProposal } from './contracts.js';
export declare class PlatformAuthorityService {
    private readonly deps;
    private readonly budgetLedger;
    private readonly policyApi;
    private readonly approvalGate;
    constructor(deps?: Partial<AuthorityDeps>, services?: {
        budgetLedger?: BudgetLedgerService;
        policyApi?: PolicyApi;
        approvalGate?: ApprovalGate;
    });
    authorizeTaskStart(actor: AuthorityActor, proposal: TaskStartProposal): TaskStartDecision;
    authorizeCanExecute(actor: AuthorityActor, proposal: CanExecuteProposal): CanExecuteDecision;
    recordApprovedSpend(args: {
        taskId: string;
        mode: CanExecuteProposal['mode'];
        shardId: string;
        provider: string;
        isEscalated: boolean;
        explicitUsd?: number;
    }): void;
    approveProShard(actor: AuthorityActor, taskId: string, note?: string): {
        allowed: false;
        reason: "rbac_denied";
        approval: null;
        alert_file?: undefined;
    } | {
        allowed: true;
        reason: "allowed";
        approval: {
            taskId: string;
            approved: boolean;
            decidedAt: string;
            note?: string;
        };
        alert_file: string | null;
    };
    authorizePolicyMutation(actor: AuthorityActor, action: 'update_budget_policy' | 'update_task_budget', patch: Partial<ReturnType<AuthorityDeps['getBudgetPolicyImpl']>>): PolicyMutationDecision;
    getTaskSpend(taskId: string, mode: CanExecuteProposal['mode']): import("../../budget-policy.js").TaskSpendState;
}
export declare const platformAuthorityService: PlatformAuthorityService;
//# sourceMappingURL=platform-authority-service.d.ts.map