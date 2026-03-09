/**
 * CoPaw Lane Bridge — stub implementation.
 * The live CoPaw service is not yet integrated in this environment.
 * All calls fall back gracefully to the KEET lane.
 */
export function getCoPawLaneHealth() {
    return { enabled: false, circuit_open: true }; // Always report closed — use KEET lane by default
}
export async function executeCoPawLane(_request) {
    return { ok: false, fallback_reason: 'copaw_not_available' };
}
//# sourceMappingURL=copaw-lane-bridge.js.map