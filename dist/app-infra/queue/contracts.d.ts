import { ChildProcess } from 'child_process';
import { RetryMetadata } from '../retry/retry-policy.js';
export interface QueuedTask {
    id: string;
    groupJid: string;
    fn: () => Promise<void>;
}
export interface QueueDropAlert {
    type: 'queue_drop';
    groupJid: string;
    retryCount: number;
    ts: number;
}
export interface QueueAlertAdapter {
    publishQueueDrop(alert: QueueDropAlert): void;
}
export interface TimerAdapter {
    setTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout>;
    clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
export interface ActiveRouteInfo {
    hitType: 'miss' | 'active' | 'standby';
    provider?: string;
}
export interface GroupQueueState {
    active: boolean;
    idleWaiting: boolean;
    isStandbyWorker: boolean;
    isTaskContainer: boolean;
    pendingMessages: boolean;
    pendingTasks: QueuedTask[];
    process: ChildProcess | null;
    containerName: string | null;
    groupFolder: string | null;
    activeProvider: string | null;
    retry: RetryMetadata;
    pendingIdempotencyKeys: Set<string>;
    retryTimer: ReturnType<typeof setTimeout> | null;
}
export interface PlatformQueueServiceContract {
    setExecutionHandler(fn: (groupJid: string) => Promise<boolean>): void;
    requestExecution(groupJid: string, idempotencyKey?: string): void;
    requestTaskExecution(groupJid: string, taskId: string, fn: () => Promise<void>): void;
    getRetryMetadata(groupJid: string): RetryMetadata;
    shutdown(gracePeriodMs: number): Promise<void>;
}
//# sourceMappingURL=contracts.d.ts.map