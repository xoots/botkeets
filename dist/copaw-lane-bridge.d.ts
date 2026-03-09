/**
 * CoPaw Lane Bridge — stub implementation.
 * The live CoPaw service is not yet integrated in this environment.
 * All calls fall back gracefully to the KEET lane.
 */
export interface CoPawLaneHealth {
    enabled: boolean;
    circuit_open: boolean;
}
export interface CoPawLaneResult {
    ok: boolean;
    outputs?: string[];
    summary?: string;
    fallback_reason?: string;
}
export interface CoPawLaneRequest {
    task_id: string;
    chat_jid: string;
    prompt: string;
    routing_context?: Record<string, unknown>;
}
export declare function getCoPawLaneHealth(): CoPawLaneHealth;
export declare function executeCoPawLane(_request: CoPawLaneRequest): Promise<CoPawLaneResult>;
//# sourceMappingURL=copaw-lane-bridge.d.ts.map