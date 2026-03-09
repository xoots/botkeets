/**
 * Trigger Signal DAG Dispatch
 *
 * DAG workflow dispatch via Trigger.dev.
 * Throws immediately when not configured — callers must guard.
 */
// ── Dispatch ───────────────────────────────────────────────────────────────────
/**
 * Dispatch a signal DAG workflow via Trigger.dev.
 * Throws with a clear message when Trigger.dev is not configured.
 */
export async function dispatchSignalDagWorkflow(input) {
    throw new Error(`dispatchSignalDagWorkflow: Trigger.dev runtime not configured (dagId=${input.dagId}). ` +
        `Set KEET_ASYNC_RUNTIME=trigger and configure TRIGGER_SECRET_KEY.`);
}
//# sourceMappingURL=dag-tasks.js.map