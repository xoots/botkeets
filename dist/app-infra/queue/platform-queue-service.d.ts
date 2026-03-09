import { ChildProcess } from 'child_process';
import { RetryMetadata } from '../retry/retry-policy.js';
import { ActiveRouteInfo, PlatformQueueServiceContract, QueueAlertAdapter, TimerAdapter } from './contracts.js';
export interface PlatformQueueServiceOptions {
    maxConcurrent?: number;
    maxRetries?: number;
    baseRetryMs?: number;
    circuitFailureThreshold?: number;
    circuitOpenMs?: number;
    alertAdapter?: QueueAlertAdapter;
    timerAdapter?: TimerAdapter;
    now?: () => number;
}
export declare class PlatformQueueService implements PlatformQueueServiceContract {
    private readonly groups;
    private readonly waitingGroups;
    private readonly retryPolicy;
    private readonly maxConcurrent;
    private readonly maxRetries;
    private readonly alertAdapter;
    private readonly timerAdapter;
    private readonly now;
    private activeCount;
    private executionHandler;
    private shuttingDown;
    constructor(options?: PlatformQueueServiceOptions);
    setExecutionHandler(fn: (groupJid: string) => Promise<boolean>): void;
    requestExecution(groupJid: string, idempotencyKey?: string): void;
    requestTaskExecution(groupJid: string, taskId: string, fn: () => Promise<void>): void;
    getRetryMetadata(groupJid: string): RetryMetadata;
    registerProcess(groupJid: string, proc: ChildProcess, containerName: string, groupFolder?: string, provider?: string): void;
    hasActiveContainer(groupJid: string): boolean;
    hasCapacity(): boolean;
    registerWarmStandby(groupJid: string, proc: ChildProcess, containerName: string, groupFolder: string, provider?: string): boolean;
    notifyIdle(groupJid: string): void;
    getActiveRouteInfo(groupJid: string): ActiveRouteInfo;
    sendMessage(groupJid: string, text: string): boolean;
    closeStdin(groupJid: string): void;
    setProcessMessagesFn(fn: (groupJid: string) => Promise<boolean>): void;
    enqueueMessageCheck(groupJid: string): void;
    enqueueTask(groupJid: string, taskId: string, fn: () => Promise<void>): void;
    getActiveCount(): number;
    getActiveGroups(): Array<{
        groupJid: string;
        containerName: string | null;
        processAlive: boolean;
    }>;
    forceKillAll(): string[];
    getHealthMetrics(): {
        activeCount: number;
        maxConcurrent: number;
        waitingGroupCount: number;
        totalPendingMessages: number;
        circuitBreakerOpenCount: number;
        shuttingDown: boolean;
        retryGroups: Array<{
            groupJid: string;
            consecutiveFailures: number;
            lastFailureReason: string | undefined;
        }>;
    };
    shutdown(_gracePeriodMs: number): Promise<void>;
    private getGroupState;
    private runForGroup;
    private handleExecutionFailure;
    private scheduleRetry;
    private runTask;
    private drainGroup;
    private drainWaiting;
    private checkBackpressure;
}
//# sourceMappingURL=platform-queue-service.d.ts.map