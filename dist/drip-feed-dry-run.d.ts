import type { PlanResult } from './project-planner.js';
import type { ExecutionRoutingContext } from './execution-routing.js';
import type { StepRoutingDecision } from './step-router.js';
import type { ExecutionHint } from './memory-types.js';
export interface DryRunStepReport {
    step: number;
    title: string;
    description: string;
    tool: string;
    execution_hint: ExecutionHint;
    is_deterministic: boolean;
    estimated_tokens: number;
    routing_decision?: StepRoutingDecision;
}
export interface DryRunReport {
    task_id: string;
    total_steps: number;
    deterministic_steps: number;
    model_steps: number;
    estimated_total_tokens: number;
    estimated_token_savings: number;
    savings_percentage: number;
    pre_task_hints: string[];
    steps: DryRunStepReport[];
}
/**
 * Simulate the drip-feed loop without spawning containers, calling models,
 * or modifying any state. Returns a report with step counts, token estimates,
 * routing decisions, and deterministic eligibility.
 */
export declare function dryRunDripFeed(plan: PlanResult, routingContext?: ExecutionRoutingContext): DryRunReport;
//# sourceMappingURL=drip-feed-dry-run.d.ts.map