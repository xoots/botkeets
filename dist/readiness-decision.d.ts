import { getDeploymentContractExpectations, getDeploymentReadinessChecks, getSupportedBuildContract, type DeploymentContractSettings, type DeploymentReadinessCheck } from './deployment-contract.js';
import { validateKeetExecutionReadiness, type KeetExecutionReadiness } from './keet-provider-config.js';
import { validateChannelBootConfig, type ChannelBootConfig, type ChannelPreflightResult } from './startup-preflight.js';
export interface RuntimeCapabilityDecisionInput {
    deployment: DeploymentContractSettings;
    channel: ChannelBootConfig;
}
export interface RuntimeExecutionReadinessSnapshot {
    eco: KeetExecutionReadiness;
    standard: KeetExecutionReadiness;
    pro: KeetExecutionReadiness;
}
export interface RuntimeCapabilityBlocker {
    code: string;
    detail: string;
    source: 'channel' | 'deployment';
}
export type RuntimeCapabilityState = 'blocked' | 'degraded' | 'full-execution-ready';
export interface RuntimeCapabilitySurface {
    available: boolean;
    detail: string;
    blockers: RuntimeCapabilityBlocker[];
}
export interface RuntimeCapabilityDecision {
    ok: boolean;
    state: RuntimeCapabilityState;
    bootable: boolean;
    degraded: boolean;
    full_execution_ready: boolean;
    summary: string;
    fatal_blockers: RuntimeCapabilityBlocker[];
    degraded_blockers: RuntimeCapabilityBlocker[];
    channel: ChannelPreflightResult;
    execution_readiness: RuntimeExecutionReadinessSnapshot;
    capabilities: {
        direct_lane: RuntimeCapabilitySurface;
        container_lane: RuntimeCapabilitySurface;
        classifier: RuntimeCapabilitySurface;
        full_execution: RuntimeCapabilitySurface;
    };
    deployment: {
        profile: DeploymentContractSettings['profile'];
        full_execution_enabled: boolean;
        build_contract: ReturnType<typeof getSupportedBuildContract>;
        expectations: ReturnType<typeof getDeploymentContractExpectations>;
        checks: DeploymentReadinessCheck[];
        blockers: Array<{
            code: string;
            detail: string;
        }>;
        fatal_blockers: RuntimeCapabilityBlocker[];
        degraded_blockers: RuntimeCapabilityBlocker[];
    };
}
export type RuntimeCapabilityName = 'direct_orchestrator' | 'container_execution' | 'full_execution' | 'classifier_sidecar';
export interface RuntimeCapabilityStatusReport {
    capability: RuntimeCapabilityName;
    available: boolean;
    detail: string;
    blockers: RuntimeCapabilityBlocker[];
}
export interface RuntimeCapabilityDecisionDeps {
    validateChannelBootConfigImpl?: typeof validateChannelBootConfig;
    getDeploymentReadinessChecksImpl?: typeof getDeploymentReadinessChecks;
    validateExecutionReadinessImpl?: typeof validateKeetExecutionReadiness;
}
export declare function getRuntimeCapabilityDecision(input: RuntimeCapabilityDecisionInput, deps?: RuntimeCapabilityDecisionDeps): Promise<RuntimeCapabilityDecision>;
export declare function getRuntimeCapabilityStatusReport(decision: RuntimeCapabilityDecision, capability: RuntimeCapabilityName): RuntimeCapabilityStatusReport;
//# sourceMappingURL=readiness-decision.d.ts.map