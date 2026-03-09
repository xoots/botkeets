export function buildRuntimeCapabilityPayload(decision) {
    return {
        state: decision.state,
        bootable: decision.bootable,
        degraded: decision.degraded,
        full_execution_ready: decision.full_execution_ready,
        summary: decision.summary,
        degraded_state: {
            active: decision.degraded,
            blockers: decision.degraded_blockers,
            summary: decision.degraded ? decision.summary : null,
        },
        lanes: {
            direct: decision.capabilities.direct_lane,
            container: decision.capabilities.container_lane,
            classifier: decision.capabilities.classifier,
            full_execution: decision.capabilities.full_execution,
        },
        capabilities: decision.capabilities,
        fatal_blockers: decision.fatal_blockers,
        degraded_blockers: decision.degraded_blockers,
    };
}
export function getStartupReadinessAction(decision) {
    return {
        mode: decision.state,
        shouldBoot: decision.bootable,
        degraded: decision.degraded,
        fatalError: decision.bootable
            ? null
            : `Startup readiness failed: ${decision.fatal_blockers.map((blocker) => `${blocker.code} (${blocker.detail})`).join('; ')}`,
    };
}
//# sourceMappingURL=runtime-capability-helper.js.map