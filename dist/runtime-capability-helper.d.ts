import type { RuntimeCapabilityDecision, RuntimeCapabilityState, RuntimeCapabilitySurface } from './readiness-decision.js';
export interface RuntimeCapabilityPayload {
    state: RuntimeCapabilityState;
    bootable: boolean;
    degraded: boolean;
    full_execution_ready: boolean;
    summary: string;
    degraded_state: {
        active: boolean;
        blockers: RuntimeCapabilityDecision['degraded_blockers'];
        summary: string | null;
    };
    lanes: {
        direct: RuntimeCapabilitySurface;
        container: RuntimeCapabilitySurface;
        classifier: RuntimeCapabilitySurface;
        full_execution: RuntimeCapabilitySurface;
    };
    capabilities: RuntimeCapabilityDecision['capabilities'];
    fatal_blockers: RuntimeCapabilityDecision['fatal_blockers'];
    degraded_blockers: RuntimeCapabilityDecision['degraded_blockers'];
}
export interface StartupReadinessAction {
    mode: RuntimeCapabilityState;
    shouldBoot: boolean;
    degraded: boolean;
    fatalError: string | null;
}
export declare function buildRuntimeCapabilityPayload(decision: RuntimeCapabilityDecision): RuntimeCapabilityPayload;
export declare function getStartupReadinessAction(decision: RuntimeCapabilityDecision): StartupReadinessAction;
//# sourceMappingURL=runtime-capability-helper.d.ts.map