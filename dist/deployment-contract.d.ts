import { SUPPORTED_WORKER_RUNNERS, validateWorkerRuntimeManifest } from '../agent-runner/scripts/runtime-artifact-contract.mjs';
export { SUPPORTED_WORKER_RUNNERS };
export { validateWorkerRuntimeManifest };
export type DeploymentProfile = 'full-execution' | 'orchestrator-only';
export interface DeploymentContractSettings {
    profile: DeploymentProfile;
    fullExecutionEnabled: boolean;
    containerRuntimeBin: string;
    containerImage: string;
    requireContainerRuntime: boolean;
    requireAgentImage: boolean;
    requireClassifierSidecar: boolean;
}
export interface SupportedBuildContractStep {
    code: 'root_app_and_worker_package' | 'worker_image';
    command: string;
    detail: string;
}
export interface DeploymentReadinessCheck {
    code: string;
    required: boolean;
    ok: boolean;
    detail: string;
}
interface WorkerPackageState {
    ok: boolean;
    detail: string;
}
interface DeploymentReadinessCheckDeps {
    commandOk?: typeof commandOk;
    httpOk?: typeof httpOk;
    getWorkerPackageState?: typeof getWorkerPackageState;
    getWorkerSourceBuildState?: typeof getWorkerSourceBuildState;
    listImages?: (runtimeBin: string) => Promise<string>;
}
export declare function getSupportedBuildContract(): SupportedBuildContractStep[];
export declare function getDeploymentContractExpectations(settings: DeploymentContractSettings): {
    container_runtime: boolean;
    worker_package: boolean;
    agent_image: boolean;
    classifier_sidecar: boolean;
};
export declare function getRequiredDeploymentBlockers(checks: DeploymentReadinessCheck[]): {
    code: string;
    detail: string;
}[];
declare function commandOk(command: string): Promise<boolean>;
declare function httpOk(url: string): Promise<boolean>;
declare function getWorkerPackageState(): WorkerPackageState;
export declare function getWorkerSourceBuildState(): Promise<WorkerPackageState>;
export declare function getDeploymentReadinessChecks(settings: DeploymentContractSettings, deps?: DeploymentReadinessCheckDeps): Promise<DeploymentReadinessCheck[]>;
//# sourceMappingURL=deployment-contract.d.ts.map