export interface RuntimeSplitMetrics {
    keet_task_runs: number;
    keet_lane_runs: number;
    copaw_lane_runs: number;
    lane_fallbacks: number;
    lane_fallback_reasons: Record<string, number>;
    copaw_agent_chats: number;
    copaw_agent_failures: number;
    copaw_bridge_failures: number;
    updated_at: string;
}
export declare function defaultRuntimeSplitMetrics(): RuntimeSplitMetrics;
export declare function mutateRuntimeSplitMetrics(mutator: (value: RuntimeSplitMetrics) => void): RuntimeSplitMetrics;
export declare function markKeetTaskRun(): void;
export declare function markLaneRun(lane: 'copaw_orchestrator' | 'keet_execution'): void;
export declare function markLaneFallback(reason: string): void;
export declare function markCoPawBridgeFailure(): void;
export declare function getRuntimeSplitMetrics(): RuntimeSplitMetrics;
//# sourceMappingURL=runtime-split.d.ts.map