import type { PlanSubtask } from './project-planner.js';
import type { ExecutionRoutingContext } from './execution-routing.js';
export type StepProvider = 'ollama' | 'openrouter' | 'claude';
export type RiskLevel = 'low' | 'medium' | 'high';
export interface StepRoutingDecision {
    step: number;
    shard_id?: string;
    tool: string;
    risk_level: RiskLevel;
    criticality_tags: string[];
    provider: StepProvider;
    model: string;
    max_retries: number;
    escalation_target: {
        provider: StepProvider;
        model: string;
    } | null;
    attempt: number;
    is_escalated: boolean;
    override_source: ExecutionRoutingContext['source'];
    effective_mode: ExecutionRoutingContext['effective_mode'];
    lane_used: ExecutionRoutingContext['lane'] | 'keet_execution';
}
export declare function decideStepRouting(subtask: PlanSubtask, routingContext: ExecutionRoutingContext, attempt: number): StepRoutingDecision;
//# sourceMappingURL=step-router.d.ts.map