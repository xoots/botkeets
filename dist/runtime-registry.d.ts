import { getCoPawLaneHealth } from './copaw-lane-bridge.js';
import { getBudgetPolicy, updateBudgetPolicy, getBudgetUsage, getTaskBudgetStatus, type BudgetPolicy } from './budget-policy.js';
import { setCoPawActiveModels, type CoPawActiveModelsInfo, type CoPawModelSlotRequest } from './copaw-system.js';
import { approveProShards } from './pro-shard-approvals.js';
import { validateKeetExecutionReadiness, type KeetExecutionReadiness } from './keet-provider-config.js';
import { runTask as runKeetTask, type ContainerExecuteFn, type TaskRunResult, type TaskRunnerOptions } from './task-runner.js';
import type { PlanResult } from './project-planner.js';
import type { Channel } from './types.js';
import { type WorkspaceContextHandle } from './platform-context-manager.js';
export type RuntimeId = 'keet' | 'copaw-agent';
export type RuntimeCapability = 'task_execution' | 'readiness' | 'budget_state' | 'shard_approval' | 'agent_chat' | 'agent_capabilities';
export interface RuntimeHealth {
    status: 'healthy' | 'degraded' | 'unavailable';
    detail: string;
    checked_at: string;
}
export interface RuntimeDescriptor<TId extends RuntimeId, TRuntime> {
    id: TId;
    capabilities: readonly RuntimeCapability[];
    version: string;
    health: RuntimeHealth;
    runtime: TRuntime;
}
export interface KeetRuntimeRunTaskRequest {
    plan: PlanResult;
    workspaceHandle?: WorkspaceContextHandle;
    channel: Channel;
    chatJid: string;
    containerExecute: ContainerExecuteFn;
    vaultEnv?: Record<string, string>;
    options?: TaskRunnerOptions;
}
export type KeetRuntimeMode = 'eco' | 'standard' | 'pro';
export interface KeetRuntimeReadinessSnapshot {
    eco: KeetExecutionReadiness;
    standard: KeetExecutionReadiness;
    pro: KeetExecutionReadiness;
}
export interface KeetBudgetState {
    policy: ReturnType<typeof getBudgetPolicy>;
    usage: ReturnType<typeof getBudgetUsage>;
    taskBudget: ReturnType<typeof getTaskBudgetStatus> | null;
}
export interface KeetShardApprovalResult {
    approval: ReturnType<typeof approveProShards>;
    alert_file: string | null;
}
export interface KeetRuntime {
    runTask(req: KeetRuntimeRunTaskRequest): Promise<TaskRunResult>;
    getReadiness(mode: KeetRuntimeMode): KeetExecutionReadiness;
    getReadiness(): KeetRuntimeReadinessSnapshot;
    getBudgetState(taskId?: string): KeetBudgetState;
    updateBudgetPolicy(patch: Partial<BudgetPolicy>): BudgetPolicy;
    setActiveModel(req: CoPawModelSlotRequest): CoPawActiveModelsInfo;
    approveShard(taskId: string, note?: string): KeetShardApprovalResult;
    refreshUi(): {
        acknowledged: true;
    };
}
export interface CoPawAgentRuntime {
    getHealth(): {
        enabled: boolean;
        base_url: string;
        circuit_open: boolean;
    };
}
export interface KeetRuntimeDeps {
    runTaskImpl: typeof runKeetTask;
    validateReadinessImpl: typeof validateKeetExecutionReadiness;
    getBudgetPolicyImpl: typeof getBudgetPolicy;
    updateBudgetPolicyImpl: typeof updateBudgetPolicy;
    getBudgetUsageImpl: typeof getBudgetUsage;
    getTaskBudgetStatusImpl: typeof getTaskBudgetStatus;
    setActiveModelImpl: typeof setCoPawActiveModels;
    approveShardImpl: typeof approveProShards;
    nowImpl: () => Date;
}
export interface CoPawAgentRuntimeDeps {
    getLaneHealthImpl: typeof getCoPawLaneHealth;
    nowImpl: () => Date;
}
export declare function createKeetRuntimeDescriptor(deps?: Partial<KeetRuntimeDeps>): RuntimeDescriptor<'keet', KeetRuntime>;
export declare function createCoPawAgentRuntimeDescriptor(deps?: Partial<CoPawAgentRuntimeDeps>): RuntimeDescriptor<'copaw-agent', CoPawAgentRuntime>;
export type RegisteredRuntimeDescriptor = RuntimeDescriptor<'keet', KeetRuntime> | RuntimeDescriptor<'copaw-agent', CoPawAgentRuntime>;
export interface RuntimeRegistry {
    list(): RegisteredRuntimeDescriptor[];
    resolve(id: 'keet'): RuntimeDescriptor<'keet', KeetRuntime>;
    resolve(id: 'copaw-agent'): RuntimeDescriptor<'copaw-agent', CoPawAgentRuntime>;
}
interface RuntimeRegistryStore {
    keet: RuntimeDescriptor<'keet', KeetRuntime>;
    'copaw-agent': RuntimeDescriptor<'copaw-agent', CoPawAgentRuntime>;
}
export declare function createRuntimeRegistry(overrides?: Partial<RuntimeRegistryStore>): RuntimeRegistry;
export declare const runtimeRegistry: RuntimeRegistry;
export {};
//# sourceMappingURL=runtime-registry.d.ts.map