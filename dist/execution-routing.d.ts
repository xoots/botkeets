import { Mode } from './mode-manager.js';
import type { ClassifierResult } from './task-classifier.js';
export type EffectiveRoutingMode = 'eco' | 'standard' | 'pro';
export type ExecutionLane = 'copaw_orchestrator' | 'keet_execution';
export interface ExecutionLaneDecision {
    lane: ExecutionLane;
    copaw_eligible: boolean;
    reason: string;
}
export interface ExecutionRoutingContext {
    requested_mode: Mode | null;
    effective_mode: EffectiveRoutingMode;
    source: 'inline_override' | 'chat_default' | 'auto_classifier';
    inline_override: Mode | null;
    clean_content: string;
    lane?: ExecutionLane;
    lane_reason?: string;
    copaw_lane_eligible?: boolean;
}
export declare function hasAssistantTrigger(rawContent: string): boolean;
export declare function normalizeRoutingInput(rawContent: string): string;
export declare function resolveExecutionLaneDecision(args: {
    effective_mode: EffectiveRoutingMode;
    classification?: Pick<ClassifierResult, 'task_type' | 'complexity' | 'quality_stakes'>;
    needs_container: boolean;
    copaw_enabled: boolean;
    copaw_healthy: boolean;
    intent?: string;
}): ExecutionLaneDecision;
export declare function resolveExecutionRoutingContext(chatJid: string, rawContent: string, classifierRecommendedMode?: Mode | null, laneDecision?: ExecutionLaneDecision): ExecutionRoutingContext;
//# sourceMappingURL=execution-routing.d.ts.map