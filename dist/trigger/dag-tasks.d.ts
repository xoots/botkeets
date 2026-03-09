/**
 * Trigger Signal DAG Dispatch
 *
 * DAG workflow dispatch via Trigger.dev.
 * Throws immediately when not configured — callers must guard.
 */
export interface SignalDagNode {
    id: string;
    kind: string;
    title?: string;
    config?: Record<string, unknown>;
}
export interface SignalDagEdge {
    from: string;
    to: string;
}
export interface SignalDagWorkflowInput {
    dagId: string;
    nodes: SignalDagNode[];
    edges: SignalDagEdge[];
    metadata?: Record<string, unknown>;
}
export interface SignalDagDispatchResult {
    runId?: string;
}
/**
 * Dispatch a signal DAG workflow via Trigger.dev.
 * Throws with a clear message when Trigger.dev is not configured.
 */
export declare function dispatchSignalDagWorkflow(input: SignalDagWorkflowInput): Promise<SignalDagDispatchResult>;
//# sourceMappingURL=dag-tasks.d.ts.map