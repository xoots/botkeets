/**
 * Trigger Task Dispatch
 *
 * Env-gated async task dispatch via Trigger.dev.
 * Only called when KEET_ASYNC_RUNTIME=trigger.
 * Both functions throw immediately when not configured — callers must guard.
 */
export type KeetTriggerMode = 'eco' | 'standard' | 'pro';
export interface KeetTriggerPayload {
    taskId: string;
    mode: KeetTriggerMode;
    chatJid: string;
    planMarkdown?: string;
    subtasks: Array<{
        step: number;
        description: string;
        tool: string;
    }> | string[];
    metadata?: Record<string, unknown>;
}
export interface KeetTriggerDispatchResult {
    runId?: string;
}
export interface FactoryAgentTaskInput {
    taskId: string;
    commitLimit?: number;
    metadata?: Record<string, unknown>;
}
/**
 * Dispatch a Keet task via Trigger.dev.
 * Throws with a clear message when KEET_ASYNC_RUNTIME !== 'trigger'.
 */
export declare function dispatchKeetTask(mode: KeetTriggerMode, payload: KeetTriggerPayload): Promise<KeetTriggerDispatchResult>;
/**
 * Dispatch a factory agent task via Trigger.dev.
 * Throws with a clear message when KEET_ASYNC_RUNTIME !== 'trigger'.
 */
export declare function dispatchFactoryAgentTask(input: FactoryAgentTaskInput): Promise<KeetTriggerDispatchResult>;
//# sourceMappingURL=tasks.d.ts.map