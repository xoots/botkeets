/**
 * Execution Lifecycle Policy
 *
 * Extracted from container-runner.ts (Sprint B).
 * Handles: register task → load memory → run task → overseer → PR → update registry.
 * Returns a discriminated ExecutionOutcome — caller decides next step.
 */
import type { PlanResult } from './project-planner.js';
import type { TaskRunResult, ExecutionMode, ContainerExecuteFn } from './task-runner.js';
import type { Channel } from './types.js';
import type { ExecutionRoutingContext } from './execution-routing.js';
import type { OverseerAction } from './overseer.js';
/**
 * Determine whether the drip-feed execution path should be used.
 *
 * Auto-activation: subtasks >= 3 AND structured mode AND not !auto override.
 * Explicit activation: !drip override tag.
 * Fallback: if drip-feed fails catastrophically, caller falls back to runTask() autonomous.
 */
export declare function shouldUseDripFeed(planResult: PlanResult, execMode: ExecutionMode, dripFeedOverride: boolean, noDrip?: boolean): boolean;
export declare function statusPatchFromTaskResult(result: TaskRunResult): {
    status: 'done' | 'failed' | 'awaiting_pro_shard_approval';
    completedAt?: number;
};
export interface ExecutionOutcome {
    success: boolean;
    result: TaskRunResult;
    overseerAction: OverseerAction;
    prUrl?: string;
    prNumber?: number;
}
/**
 * Execution phase: register task, load memory, run task,
 * evaluate with overseer, attempt PR, update registry.
 */
export declare function executeAndFinalize(planResult: PlanResult, execMode: ExecutionMode, groupJid: string, telegram: Channel, containerExecute: ContainerExecuteFn, vaultEnv: Record<string, string>, routingContext: ExecutionRoutingContext, options?: {
    originalMsgId?: string;
    clarificationAnswers?: Record<string, string>;
    injectedAnchorContext?: {
        anchorContent: string;
        userContext: string;
    };
    taskSummary?: string;
    /** When true (from !drip override or auto-activation), use drip-feed execution path */
    dripFeed?: boolean;
    /** When true (!nodrip), suppress drip-feed auto-activation */
    noDrip?: boolean;
    /** Correlation ID for distributed tracing */
    traceId?: string;
}): Promise<ExecutionOutcome>;
//# sourceMappingURL=execution-lifecycle.d.ts.map