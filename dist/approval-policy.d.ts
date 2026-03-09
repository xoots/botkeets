/**
 * Approval Policy
 *
 * Extracted from container-runner.ts (Sprint B).
 * Handles: plan approval gate → clarification questions → pro-shard budget gate → exec mode selection.
 * Returns an ApprovalOutcome discriminated union — caller decides next step.
 */
import type { PlanResult } from './project-planner.js';
import type { Channel } from './types.js';
import type { ExecutionMode } from './task-runner.js';
import type { ExecutionRoutingContext } from './execution-routing.js';
export type ApprovalOutcome = {
    kind: 'approved';
    execMode: ExecutionMode;
    planResult: PlanResult;
    dripFeed: boolean;
    noDrip: boolean;
} | {
    kind: 'paused_for_approval';
    reason: 'plan_review' | 'clarification' | 'pro_shard';
} | {
    kind: 'budget_blocked';
    reason: string;
};
/**
 * Approval phase: check plan approval gate, clarification questions,
 * pro-shard budget gate. Returns outcome — caller decides next step.
 */
export declare function approveAndClarify(planResult: PlanResult, taskText: string, groupJid: string, telegram: Channel, routingContext: ExecutionRoutingContext): Promise<ApprovalOutcome>;
//# sourceMappingURL=approval-policy.d.ts.map