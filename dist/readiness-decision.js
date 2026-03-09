import { getDeploymentContractExpectations, getDeploymentReadinessChecks, getRequiredDeploymentBlockers, getSupportedBuildContract, } from './deployment-contract.js';
import { validateKeetExecutionReadiness, } from './keet-provider-config.js';
import { validateChannelBootConfig, } from './startup-preflight.js';
const CONTAINER_EXECUTION_CHECK_CODES = new Set([
    'container_runtime_binary',
    'container_runtime_reachable',
    'worker_package',
    'worker_source_build',
    'container_agent_image',
]);
const CLASSIFIER_EXECUTION_CHECK_CODES = new Set([
    'classifier_sidecar_health',
]);
function summarizeDirectPathAvailability(readiness) {
    const readyModes = ['eco', 'standard', 'pro'].filter((mode) => readiness[mode].ok);
    if (readyModes.length > 0) {
        return {
            available: true,
            detail: `Direct/orchestrator path is available via ${readyModes.join(', ')} mode`,
        };
    }
    const reasons = ['eco', 'standard', 'pro']
        .flatMap((mode) => readiness[mode].errors.map((error) => `${mode}: ${error}`));
    return {
        available: false,
        detail: reasons.length > 0
            ? `Direct/orchestrator path is unavailable: ${reasons.join('; ')}`
            : 'Direct/orchestrator path is unavailable',
    };
}
function getCapabilityBlockers(checks, codes) {
    return checks
        .filter((check) => codes.has(check.code) && !check.ok)
        .map((check) => ({
        code: check.code,
        detail: check.detail,
        source: 'deployment',
    }));
}
function buildSummary(state, channel, fatalBlockers, degradedBlockers) {
    if (!channel.ok) {
        return `Channel boot config invalid: ${channel.errors.join('; ')}`;
    }
    if (fatalBlockers.length > 0) {
        return `Boot blocked by ${fatalBlockers.map((blocker) => blocker.code).join(', ')}`;
    }
    if (state === 'degraded' || degradedBlockers.length > 0) {
        return `Bootable in degraded mode: ${degradedBlockers.map((blocker) => blocker.code).join(', ')}`;
    }
    return 'Full execution ready';
}
export async function getRuntimeCapabilityDecision(input, deps = {}) {
    const validateChannel = deps.validateChannelBootConfigImpl ?? validateChannelBootConfig;
    const getChecks = deps.getDeploymentReadinessChecksImpl ?? getDeploymentReadinessChecks;
    const validateExecutionReadiness = deps.validateExecutionReadinessImpl ?? validateKeetExecutionReadiness;
    const channel = validateChannel(input.channel);
    const checks = await getChecks(input.deployment);
    const blockers = getRequiredDeploymentBlockers(checks);
    const executionReadiness = {
        eco: validateExecutionReadiness('eco'),
        standard: validateExecutionReadiness('standard'),
        pro: validateExecutionReadiness('pro'),
    };
    const directOrchestrator = summarizeDirectPathAvailability(executionReadiness);
    const containerLaneBlockers = getCapabilityBlockers(checks, CONTAINER_EXECUTION_CHECK_CODES);
    const classifierBlockers = getCapabilityBlockers(checks, CLASSIFIER_EXECUTION_CHECK_CODES);
    const fullExecutionBlockers = getCapabilityBlockers(checks, new Set([
        ...CONTAINER_EXECUTION_CHECK_CODES,
        ...CLASSIFIER_EXECUTION_CHECK_CODES,
    ]));
    const containerExecutionAvailable = containerLaneBlockers.length === 0;
    const classifierHealth = checks.find((check) => check.code === 'classifier_sidecar_health');
    const classifierSidecarAvailable = classifierBlockers.length === 0;
    const fullExecutionAvailable = fullExecutionBlockers.length === 0;
    const fatalBlockers = [];
    const degradedBlockers = [];
    if (!channel.ok) {
        fatalBlockers.push({
            code: 'channel_boot_config',
            detail: channel.errors.join('; '),
            source: 'channel',
        });
    }
    for (const blocker of blockers) {
        if (directOrchestrator.available) {
            degradedBlockers.push({
                ...blocker,
                source: 'deployment',
            });
        }
        else {
            fatalBlockers.push({
                ...blocker,
                source: 'deployment',
            });
        }
    }
    const bootable = fatalBlockers.length === 0;
    const fullExecutionReady = bootable && fullExecutionAvailable;
    const state = !bootable
        ? 'blocked'
        : fullExecutionReady
            ? 'full-execution-ready'
            : 'degraded';
    const directLane = {
        available: directOrchestrator.available,
        detail: directOrchestrator.detail,
        blockers: [],
    };
    const containerLane = {
        available: containerExecutionAvailable,
        detail: containerExecutionAvailable
            ? 'Container lane is available'
            : containerLaneBlockers.map((blocker) => `${blocker.code}: ${blocker.detail}`).join('; '),
        blockers: containerLaneBlockers,
    };
    const classifier = {
        available: classifierSidecarAvailable,
        detail: classifierSidecarAvailable
            ? classifierHealth?.detail ?? 'Classifier is healthy'
            : classifierBlockers.map((blocker) => `${blocker.code}: ${blocker.detail}`).join('; '),
        blockers: classifierBlockers,
    };
    const fullExecution = {
        available: fullExecutionReady,
        detail: fullExecutionReady
            ? 'Full execution path is available'
            : fullExecutionBlockers.length > 0
                ? fullExecutionBlockers.map((blocker) => `${blocker.code}: ${blocker.detail}`).join('; ')
                : 'Full execution path is unavailable',
        blockers: fullExecutionBlockers,
    };
    return {
        ok: bootable,
        state,
        bootable,
        degraded: state === 'degraded',
        full_execution_ready: fullExecutionReady,
        summary: buildSummary(state, channel, fatalBlockers, degradedBlockers),
        fatal_blockers: fatalBlockers,
        degraded_blockers: degradedBlockers,
        channel,
        execution_readiness: executionReadiness,
        capabilities: {
            direct_lane: directLane,
            container_lane: containerLane,
            classifier,
            full_execution: fullExecution,
        },
        deployment: {
            profile: input.deployment.profile,
            full_execution_enabled: input.deployment.fullExecutionEnabled,
            build_contract: getSupportedBuildContract(),
            expectations: getDeploymentContractExpectations(input.deployment),
            checks,
            blockers,
            fatal_blockers: fatalBlockers.filter((blocker) => blocker.source === 'deployment'),
            degraded_blockers: degradedBlockers,
        },
    };
}
export function getRuntimeCapabilityStatusReport(decision, capability) {
    if (capability === 'direct_orchestrator') {
        return {
            capability,
            available: decision.capabilities.direct_lane.available,
            detail: decision.capabilities.direct_lane.detail,
            blockers: [],
        };
    }
    const surface = capability === 'container_execution'
        ? decision.capabilities.container_lane
        : capability === 'full_execution'
            ? decision.capabilities.full_execution
            : decision.capabilities.classifier;
    return {
        capability,
        available: surface.available,
        detail: surface.detail,
        blockers: surface.blockers,
    };
}
//# sourceMappingURL=readiness-decision.js.map