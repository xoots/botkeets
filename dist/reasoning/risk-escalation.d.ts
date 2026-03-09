import type { ReasoningModelCatalog, ReasoningRiskLevel, ReasoningRoutingContext, ReasoningStep, ReasoningStepRoutingDecision } from './contracts.js';
export declare function inferRiskLevel(step: ReasoningStep): ReasoningRiskLevel;
export declare function inferCriticalityTags(step: ReasoningStep): string[];
export declare function decideRiskBasedEscalation(args: {
    step: ReasoningStep;
    context: ReasoningRoutingContext;
    attempt: number;
    models: ReasoningModelCatalog;
    strictLocalOverride: boolean;
}): ReasoningStepRoutingDecision;
//# sourceMappingURL=risk-escalation.d.ts.map