export type ReasoningRiskLevel = 'low' | 'medium' | 'high';
export type ReasoningMode = 'eco' | 'standard' | 'pro';
export type ReasoningLane = 'copaw_orchestrator' | 'keet_execution';
export interface ReasoningStep {
    step: number;
    description: string;
    tool: string;
    dependsOn: number[];
    estimatedMs: number;
    risk_level?: ReasoningRiskLevel;
    criticality_tags?: string[];
}
export interface ReasoningRoutingContext {
    effective_mode: ReasoningMode;
    source: 'inline_override' | 'chat_default' | 'auto_classifier';
    lane?: ReasoningLane;
}
export interface ReasoningModelCatalog {
    eco_local: string;
    eco_search: string;
    standard_default: string;
    standard_escalation: string;
    pro_default: string;
}
export type ReasoningProvider = 'ollama' | 'openrouter' | 'claude';
export interface ReasoningStepRoutingDecision {
    step: number;
    tool: string;
    risk_level: ReasoningRiskLevel;
    criticality_tags: string[];
    provider: ReasoningProvider;
    model: string;
    max_retries: number;
    escalation_target: {
        provider: ReasoningProvider;
        model: string;
    } | null;
    attempt: number;
    is_escalated: boolean;
    override_source: ReasoningRoutingContext['source'];
    effective_mode: ReasoningMode;
    lane_used: ReasoningLane;
}
export interface WorkShard {
    id: string;
    text: string;
    depth: number;
    index: number;
    total: number;
}
export interface ShardPlanResult {
    nextQueue: WorkShard[];
    completedOutput?: string;
    terminalError?: string;
}
export type StepControlAction = 'complete' | 'retry' | 'escalate' | 'split_shard' | 'trigger_escape_hatch' | 'fail';
export interface StepActionInput {
    success: boolean;
    attempt: number;
    maxRetries: number;
    escalationAvailable: boolean;
    alreadyEscalated: boolean;
    hardStopExceeded: boolean;
    shardSplitAvailable: boolean;
    shardDepth: number;
    maxShardDepth: number;
}
//# sourceMappingURL=contracts.d.ts.map