/**
 * Drip-Feed Executor
 *
 * Sequential micro-task executor. Processes a plan's subtasks one at a time,
 * injecting memory context and summarized previous results between steps.
 *
 * Reuses:
 *   ContainerExecuteFn IoC callback  — task-runner.ts (no circular imports)
 *   StagingCache                     — staging-cache.ts
 *   MicroTask                        — memory-types.ts
 *   decideStepRouting()              — step-router.ts (model escalation)
 *   Graceful degradation             — memory-session.ts pattern
 *   Fire-and-forget signal           — task-classifier.ts pattern
 *
 * Returns TaskRunResult → executeAndFinalize() consumers unchanged.
 */
import type { PlanResult } from './project-planner.js';
import type { Channel } from './types.js';
import type { ContainerExecuteFn, TaskRunResult } from './task-runner.js';
import type { ExecutionRoutingContext } from './execution-routing.js';
export interface DripFeedOptions {
    anchorContext?: string;
    sessionId?: string;
    routingContext?: ExecutionRoutingContext;
    vaultEnv?: Record<string, string>;
}
/**
 * Execute a plan's subtasks sequentially as micro-tasks.
 *
 * For each MicroTask in dependency order:
 *   1. Inject memory anchor + summarized previous results from StagingCache
 *   2. Execute via containerExecute callback (same ContainerExecuteFn as runTask)
 *   3. Stage result in cache
 *   4. On failure: retry up to 3×, escalate model tier (eco → standard → pro)
 *   5. Compact context between micros (clear raw outputs, keep summaries)
 *
 * Dynamic micro insertion: if a result reveals new work, decompose and append.
 * Final synthesis: aggregate all staged results into unified output.
 *
 * @returns TaskRunResult — same type as runTask(), downstream code unchanged.
 */
export declare function dripFeedExecute(plan: PlanResult, _channel: Channel, chatJid: string, containerExecute: ContainerExecuteFn, opts?: DripFeedOptions): Promise<TaskRunResult>;
//# sourceMappingURL=drip-feed-executor.d.ts.map