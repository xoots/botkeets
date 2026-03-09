import type { PlanResult } from './project-planner.js';
import type { ExecutionMode } from './task-runner.js';
import type { ExecutionRoutingContext } from './execution-routing.js';
export interface PendingProShardTask {
    taskId: string;
    groupJid: string;
    planResult: PlanResult;
    vaultEnv: Record<string, string>;
    execMode: ExecutionMode;
    routingContext: ExecutionRoutingContext;
    originalMsgId?: string;
    createdAt: number;
}
export declare function savePendingProShardTask(task: PendingProShardTask): void;
export declare function getPendingProShardTask(taskId: string): PendingProShardTask | null;
export declare function findPendingProShardTaskByGroup(groupJid: string): PendingProShardTask | null;
export declare function getAllPendingProShardTasks(): PendingProShardTask[];
export declare function clearPendingProShardTask(taskId: string): void;
//# sourceMappingURL=pro-shard-pending-store.d.ts.map