import type { EffectiveRoutingMode } from '../../execution-routing.js';
export declare class BudgetLedgerService {
    canExecute(args: {
        taskId: string;
        mode: EffectiveRoutingMode;
        shardId: string;
        provider: string;
        isEscalated: boolean;
    }): {
        allowed: boolean;
        reason?: import("../../budget-policy.js").BudgetBlockedReason;
        expectedUsd: number;
        statuses: {
            global: import("../../budget-policy.js").BudgetStatus;
            mode: import("../../budget-policy.js").BudgetStatus;
            task: import("../../budget-policy.js").BudgetStatus;
            shard: import("../../budget-policy.js").BudgetStatus;
            escalation: import("../../budget-policy.js").BudgetStatus;
        };
    };
    recordApprovedSpend(args: {
        taskId: string;
        mode: EffectiveRoutingMode;
        shardId: string;
        provider: string;
        isEscalated: boolean;
        explicitUsd?: number;
    }): {
        addedUsd: number;
        task: import("../../budget-policy.js").TaskSpendState;
    };
    getTaskSpend(taskId: string, mode: EffectiveRoutingMode): import("../../budget-policy.js").TaskSpendState;
}
//# sourceMappingURL=budget-ledger-service.d.ts.map