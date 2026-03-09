import { StepRoutingDecision } from './step-router.js';
export interface StepRoutingLogEntry extends StepRoutingDecision {
    ts: string;
}
export interface StepRoutingStats {
    totalSteps: number;
    escalatedSteps: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
    byRisk: Record<string, number>;
    byLane: Record<string, number>;
}
export declare function logStepRoutingDecision(entry: StepRoutingDecision): void;
export declare function readRecentStepRoutingLogs(days?: number): StepRoutingLogEntry[];
export declare function aggregateStepRouting(entries: StepRoutingLogEntry[]): StepRoutingStats;
//# sourceMappingURL=step-routing-logger.d.ts.map