import type { EffectiveRoutingMode } from './execution-routing.js';
export type BudgetBlockedReason = 'blocked_budget_global' | 'blocked_budget_mode' | 'blocked_budget_task' | 'blocked_budget_shard' | 'blocked_budget_escalation';
export interface BudgetPolicy {
    global: {
        daily_usd: number;
        monthly_usd: number;
        rollover: boolean;
    };
    mode: Record<EffectiveRoutingMode, {
        daily_usd: number;
    }>;
    defaults: {
        task_usd: number;
        shard_usd: number;
        escalation_usd: number;
    };
    task_overrides?: Record<string, {
        task_usd?: number;
        shard_usd?: number;
        escalation_usd?: number;
    }>;
    pro: {
        shard_strategy: 'manual_approval' | 'auto_selective' | 'off';
        max_shards_per_task: number;
        max_calls_per_task: number;
    };
}
export interface BudgetStatus {
    remaining: number;
    spent: number;
    blocked_reason?: BudgetBlockedReason;
}
export interface BudgetModeSnapshot {
    remaining: number | null;
    affordable: boolean;
}
export interface TaskSpendState {
    taskId: string;
    mode: EffectiveRoutingMode;
    spent: number;
    escalationSpent: number;
    calls: number;
    shards: Record<string, number>;
}
interface UsageState {
    day: string;
    month: string;
    globalDailySpent: number;
    globalMonthlySpent: number;
    modeDailySpent: Record<EffectiveRoutingMode, number>;
    tasks: Record<string, TaskSpendState>;
    blockEvents: Array<{
        ts: string;
        reason: BudgetBlockedReason;
        taskId: string;
        mode: EffectiveRoutingMode;
        expectedUsd: number;
    }>;
}
export declare function getBudgetPolicy(): BudgetPolicy;
export declare function updateBudgetPolicy(patch: Partial<BudgetPolicy>): BudgetPolicy;
export declare function getOrInitTaskSpend(taskId: string, mode: EffectiveRoutingMode): TaskSpendState;
export declare function evaluateBudget(args: {
    taskId: string;
    mode: EffectiveRoutingMode;
    shardId: string;
    provider: string;
    isEscalated: boolean;
}): {
    allowed: boolean;
    reason?: BudgetBlockedReason;
    expectedUsd: number;
    statuses: {
        global: BudgetStatus;
        mode: BudgetStatus;
        task: BudgetStatus;
        shard: BudgetStatus;
        escalation: BudgetStatus;
    };
};
export declare function recordSpend(args: {
    taskId: string;
    mode: EffectiveRoutingMode;
    shardId: string;
    provider: string;
    isEscalated: boolean;
    explicitUsd?: number;
}): {
    addedUsd: number;
    task: TaskSpendState;
};
export declare function getBudgetUsage(): {
    day: string;
    month: string;
    globalDailySpent: number;
    globalMonthlySpent: number;
    modeDailySpent: Record<EffectiveRoutingMode, number>;
    tasks: TaskSpendState[];
    blockEvents: UsageState['blockEvents'];
};
export declare function getTaskBudgetStatus(taskId: string): {
    policy: BudgetPolicy;
    task: TaskSpendState | null;
    statuses: {
        global: BudgetStatus;
        mode: BudgetStatus;
        task: BudgetStatus;
        escalation: BudgetStatus;
    } | null;
};
export declare function getBudgetStatus(): Record<EffectiveRoutingMode, BudgetModeSnapshot>;
export {};
//# sourceMappingURL=budget-policy.d.ts.map