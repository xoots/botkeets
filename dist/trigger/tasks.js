/**
 * Trigger Task Dispatch
 *
 * Env-gated async task dispatch via Trigger.dev.
 * Only called when KEET_ASYNC_RUNTIME=trigger.
 * Both functions throw immediately when not configured — callers must guard.
 */
// ── Dispatch ───────────────────────────────────────────────────────────────────
/**
 * Dispatch a Keet task via Trigger.dev.
 * Throws with a clear message when KEET_ASYNC_RUNTIME !== 'trigger'.
 */
export async function dispatchKeetTask(mode, payload) {
    throw new Error(`dispatchKeetTask: Trigger.dev runtime not configured (mode=${mode}, taskId=${payload.taskId}). ` +
        `Set KEET_ASYNC_RUNTIME=trigger and configure TRIGGER_SECRET_KEY.`);
}
/**
 * Dispatch a factory agent task via Trigger.dev.
 * Throws with a clear message when KEET_ASYNC_RUNTIME !== 'trigger'.
 */
export async function dispatchFactoryAgentTask(input) {
    throw new Error(`dispatchFactoryAgentTask: Trigger.dev runtime not configured (taskId=${input.taskId}). ` +
        `Set KEET_ASYNC_RUNTIME=trigger and configure TRIGGER_SECRET_KEY.`);
}
//# sourceMappingURL=tasks.js.map