import { COPAW_BASE_URL, COPAW_ENABLED } from './config.js';
import { getCoPawLaneHealth } from './copaw-lane-bridge.js';
import { getBudgetPolicy, updateBudgetPolicy, getBudgetUsage, getTaskBudgetStatus, } from './budget-policy.js';
import { setCoPawActiveModels, } from './copaw-system.js';
import { approveProShards, } from './pro-shard-approvals.js';
import { validateKeetExecutionReadiness, } from './keet-provider-config.js';
import { runTask as runKeetTask, } from './task-runner.js';
import { platformContextManager } from './platform-context-manager.js';
import { PlatformAuthorityService } from './app-infra/authority/platform-authority-service.js';
function nowIso(nowImpl) {
    return nowImpl().toISOString();
}
export function createKeetRuntimeDescriptor(deps = {}) {
    const merged = {
        runTaskImpl: runKeetTask,
        validateReadinessImpl: validateKeetExecutionReadiness,
        getBudgetPolicyImpl: getBudgetPolicy,
        updateBudgetPolicyImpl: updateBudgetPolicy,
        getBudgetUsageImpl: getBudgetUsage,
        getTaskBudgetStatusImpl: getTaskBudgetStatus,
        setActiveModelImpl: setCoPawActiveModels,
        approveShardImpl: approveProShards,
        nowImpl: () => new Date(),
        ...deps,
    };
    const readiness = {
        eco: merged.validateReadinessImpl('eco'),
        standard: merged.validateReadinessImpl('standard'),
        pro: merged.validateReadinessImpl('pro'),
    };
    const allModesReady = readiness.eco.ok && readiness.standard.ok && readiness.pro.ok;
    const authorityService = new PlatformAuthorityService({
        approveShardImpl: (taskId, note) => ({
            approval: merged.approveShardImpl(taskId, note),
            alert_file: null,
        }),
    });
    const runtime = {
        async runTask(req) {
            const workspaceHandle = req.workspaceHandle
                ?? req.plan.workspaceHandle
                ?? platformContextManager.adoptWorkspaceContext({
                    namespace: 'keet',
                    workspace: req.plan.workspace,
                });
            const options = {
                ...(req.options ?? {}),
                workspaceLeaseId: workspaceHandle.leaseId,
                workspaceNamespace: workspaceHandle.namespace,
            };
            return merged.runTaskImpl(req.plan, req.channel, req.chatJid, req.containerExecute, req.vaultEnv ?? {}, options);
        },
        getReadiness: ((mode) => {
            if (mode)
                return merged.validateReadinessImpl(mode);
            return {
                eco: merged.validateReadinessImpl('eco'),
                standard: merged.validateReadinessImpl('standard'),
                pro: merged.validateReadinessImpl('pro'),
            };
        }),
        getBudgetState(taskId) {
            return {
                policy: merged.getBudgetPolicyImpl(),
                usage: merged.getBudgetUsageImpl(),
                taskBudget: taskId ? merged.getTaskBudgetStatusImpl(taskId) : null,
            };
        },
        updateBudgetPolicy(patch) {
            return merged.updateBudgetPolicyImpl(patch);
        },
        setActiveModel(req) {
            return merged.setActiveModelImpl(req);
        },
        approveShard(taskId, note) {
            const infraDecision = authorityService.approveProShard({ id: 'runtime-registry', role: 'infra-service' }, taskId, note);
            const approval = infraDecision.approval
                ?? merged.approveShardImpl(taskId, note);
            return {
                approval,
                alert_file: infraDecision.alert_file ?? null,
            };
        },
        refreshUi() {
            return { acknowledged: true };
        },
    };
    return {
        id: 'keet',
        version: '1.0.0',
        capabilities: ['task_execution', 'readiness', 'budget_state', 'shard_approval'],
        health: {
            status: allModesReady ? 'healthy' : 'degraded',
            detail: allModesReady
                ? 'KEET runtime readiness checks passed for eco, standard, and pro.'
                : 'One or more KEET runtime readiness checks failed.',
            checked_at: nowIso(merged.nowImpl),
        },
        runtime,
    };
}
export function createCoPawAgentRuntimeDescriptor(deps = {}) {
    const merged = {
        getLaneHealthImpl: getCoPawLaneHealth,
        nowImpl: () => new Date(),
        ...deps,
    };
    const laneHealth = merged.getLaneHealthImpl();
    const runtime = {
        getHealth() {
            const health = merged.getLaneHealthImpl();
            return {
                enabled: COPAW_ENABLED,
                base_url: COPAW_BASE_URL,
                circuit_open: health.circuit_open,
            };
        },
    };
    return {
        id: 'copaw-agent',
        version: '0.3.0',
        capabilities: ['agent_chat', 'agent_capabilities'],
        health: {
            status: laneHealth.enabled && !laneHealth.circuit_open ? 'healthy' : 'degraded',
            detail: laneHealth.enabled
                ? laneHealth.circuit_open
                    ? 'CoPaw agent bridge circuit is open.'
                    : 'CoPaw agent bridge is enabled.'
                : 'CoPaw agent bridge is disabled.',
            checked_at: nowIso(merged.nowImpl),
        },
        runtime,
    };
}
export function createRuntimeRegistry(overrides = {}) {
    const store = {
        keet: overrides.keet ?? createKeetRuntimeDescriptor(),
        'copaw-agent': overrides['copaw-agent'] ?? createCoPawAgentRuntimeDescriptor(),
    };
    function resolve(id) {
        return store[id];
    }
    return {
        list() {
            return [store.keet, store['copaw-agent']];
        },
        resolve,
    };
}
export const runtimeRegistry = createRuntimeRegistry();
//# sourceMappingURL=runtime-registry.js.map