import fs from 'fs';
import path from 'path';
import { IPC_DIR, MAX_CONCURRENT_CONTAINERS, QUEUE_DEPTH_ALERT_THRESHOLD } from '../../config.js';
import { logger } from '../../logger.js';
import { RetryPolicy } from '../retry/retry-policy.js';
import { IpcQueueAlertAdapter } from './adapters/ipc-queue-alert-adapter.js';
import { SystemTimerAdapter } from './adapters/system-timer-adapter.js';
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_MS = 5000;
export class PlatformQueueService {
    groups = new Map();
    waitingGroups = [];
    retryPolicy;
    maxConcurrent;
    maxRetries;
    alertAdapter;
    timerAdapter;
    now;
    activeCount = 0;
    executionHandler = null;
    shuttingDown = false;
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT_CONTAINERS;
        this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.retryPolicy = new RetryPolicy({
            maxRetries: this.maxRetries,
            baseDelayMs: options.baseRetryMs ?? DEFAULT_BASE_RETRY_MS,
            circuitFailureThreshold: options.circuitFailureThreshold ?? 0,
            circuitOpenMs: options.circuitOpenMs ?? 60_000,
        });
        this.alertAdapter = options.alertAdapter ?? new IpcQueueAlertAdapter();
        this.timerAdapter = options.timerAdapter ?? new SystemTimerAdapter();
        this.now = options.now ?? (() => Date.now());
    }
    setExecutionHandler(fn) {
        this.executionHandler = fn;
    }
    requestExecution(groupJid, idempotencyKey) {
        if (this.shuttingDown)
            return;
        const state = this.getGroupState(groupJid);
        if (idempotencyKey) {
            if (state.pendingIdempotencyKeys.has(idempotencyKey)) {
                logger.debug({ groupJid, idempotencyKey }, 'Duplicate execution request ignored');
                return;
            }
            state.pendingIdempotencyKeys.add(idempotencyKey);
        }
        if (state.active) {
            state.pendingMessages = true;
            return;
        }
        if (this.retryPolicy.isCircuitOpen(state.retry, this.now())) {
            state.pendingMessages = true;
            this.scheduleRetry(groupJid, state, Math.max(0, (state.retry.circuitOpenUntilMs ?? this.now()) - this.now()));
            return;
        }
        if (this.activeCount >= this.maxConcurrent) {
            state.pendingMessages = true;
            if (!this.waitingGroups.includes(groupJid)) {
                this.waitingGroups.push(groupJid);
            }
            this.checkBackpressure();
            return;
        }
        this.runForGroup(groupJid, 'messages').catch((err) => logger.error({ groupJid, err }, 'Unhandled error in platform queue runForGroup'));
    }
    requestTaskExecution(groupJid, taskId, fn) {
        if (this.shuttingDown)
            return;
        const state = this.getGroupState(groupJid);
        if (state.pendingTasks.some((task) => task.id === taskId)) {
            return;
        }
        const queuedTask = { id: taskId, groupJid, fn };
        if (state.active) {
            state.pendingTasks.push(queuedTask);
            if (state.idleWaiting) {
                this.closeStdin(groupJid);
            }
            return;
        }
        if (this.activeCount >= this.maxConcurrent) {
            state.pendingTasks.push(queuedTask);
            if (!this.waitingGroups.includes(groupJid)) {
                this.waitingGroups.push(groupJid);
            }
            return;
        }
        this.runTask(groupJid, queuedTask).catch((err) => logger.error({ groupJid, taskId, err }, 'Unhandled error in platform queue runTask'));
    }
    getRetryMetadata(groupJid) {
        return { ...this.getGroupState(groupJid).retry };
    }
    registerProcess(groupJid, proc, containerName, groupFolder, provider) {
        const state = this.getGroupState(groupJid);
        state.process = proc;
        state.containerName = containerName;
        if (groupFolder)
            state.groupFolder = groupFolder;
        state.isStandbyWorker = false;
        state.activeProvider = provider ?? null;
    }
    hasActiveContainer(groupJid) {
        return this.getGroupState(groupJid).active;
    }
    hasCapacity() {
        return this.activeCount < this.maxConcurrent;
    }
    registerWarmStandby(groupJid, proc, containerName, groupFolder, provider) {
        const state = this.getGroupState(groupJid);
        if (state.active || this.activeCount >= this.maxConcurrent) {
            return false;
        }
        state.active = true;
        state.idleWaiting = true;
        state.isStandbyWorker = true;
        state.isTaskContainer = false;
        state.pendingMessages = false;
        state.process = proc;
        state.containerName = containerName;
        state.groupFolder = groupFolder;
        state.activeProvider = provider ?? null;
        this.activeCount++;
        proc.once('close', () => {
            const current = this.getGroupState(groupJid);
            if (current.process !== proc || current.containerName !== containerName) {
                return;
            }
            current.active = false;
            current.idleWaiting = false;
            current.isTaskContainer = false;
            current.isStandbyWorker = false;
            current.process = null;
            current.containerName = null;
            current.groupFolder = null;
            current.activeProvider = null;
            this.activeCount = Math.max(0, this.activeCount - 1);
            this.drainGroup(groupJid);
        });
        return true;
    }
    notifyIdle(groupJid) {
        const state = this.getGroupState(groupJid);
        state.idleWaiting = true;
        if (state.pendingTasks.length > 0) {
            this.closeStdin(groupJid);
        }
    }
    getActiveRouteInfo(groupJid) {
        const state = this.getGroupState(groupJid);
        if (!state.active || state.isTaskContainer)
            return { hitType: 'miss' };
        if (state.isStandbyWorker) {
            return { hitType: 'standby', provider: state.activeProvider || undefined };
        }
        return { hitType: 'active', provider: state.activeProvider || undefined };
    }
    sendMessage(groupJid, text) {
        const state = this.getGroupState(groupJid);
        if (!state.active || !state.groupFolder || state.isTaskContainer)
            return false;
        state.idleWaiting = false;
        const inputDir = path.join(IPC_DIR, state.groupFolder, 'input');
        try {
            fs.mkdirSync(inputDir, { recursive: true });
            const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
            const filepath = path.join(inputDir, filename);
            const tempPath = `${filepath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify({ type: 'message', text }));
            fs.renameSync(tempPath, filepath);
            return true;
        }
        catch {
            return false;
        }
    }
    closeStdin(groupJid) {
        const state = this.getGroupState(groupJid);
        if (!state.active || !state.groupFolder)
            return;
        const inputDir = path.join(IPC_DIR, state.groupFolder, 'input');
        try {
            fs.mkdirSync(inputDir, { recursive: true });
            fs.writeFileSync(path.join(inputDir, '_close'), '');
        }
        catch {
            // ignore
        }
    }
    // Backward-compatible aliases during migration.
    setProcessMessagesFn(fn) {
        this.setExecutionHandler(fn);
    }
    enqueueMessageCheck(groupJid) {
        this.requestExecution(groupJid);
    }
    enqueueTask(groupJid, taskId, fn) {
        this.requestTaskExecution(groupJid, taskId, fn);
    }
    getActiveCount() {
        return this.activeCount;
    }
    getActiveGroups() {
        const result = [];
        for (const [groupJid, state] of this.groups) {
            if (!state.active)
                continue;
            const processAlive = state.process !== null && !state.process.killed && state.process.exitCode === null;
            result.push({ groupJid, containerName: state.containerName, processAlive });
        }
        return result;
    }
    forceKillAll() {
        const killed = [];
        for (const [groupJid, state] of this.groups) {
            if (!state.active)
                continue;
            const name = state.containerName ?? groupJid;
            if (state.process && !state.process.killed) {
                try {
                    state.process.kill('SIGKILL');
                }
                catch {
                    // process already exited
                }
            }
            state.active = false;
            state.idleWaiting = false;
            state.isStandbyWorker = false;
            state.isTaskContainer = false;
            state.process = null;
            state.containerName = null;
            state.groupFolder = null;
            state.activeProvider = null;
            this.activeCount = Math.max(0, this.activeCount - 1);
            killed.push(name);
        }
        return killed;
    }
    getHealthMetrics() {
        let totalPendingMessages = 0;
        let circuitBreakerOpenCount = 0;
        const retryGroups = [];
        const nowMs = this.now();
        for (const [groupJid, state] of this.groups) {
            if (state.pendingMessages)
                totalPendingMessages++;
            if (this.retryPolicy.isCircuitOpen(state.retry, nowMs))
                circuitBreakerOpenCount++;
            if (state.retry.retryCount > 0) {
                retryGroups.push({
                    groupJid,
                    consecutiveFailures: state.retry.consecutiveFailures,
                    lastFailureReason: state.retry.lastFailureReason,
                });
            }
        }
        return {
            activeCount: this.activeCount,
            maxConcurrent: this.maxConcurrent,
            waitingGroupCount: this.waitingGroups.length,
            totalPendingMessages,
            circuitBreakerOpenCount,
            shuttingDown: this.shuttingDown,
            retryGroups,
        };
    }
    async shutdown(_gracePeriodMs) {
        this.shuttingDown = true;
        for (const state of this.groups.values()) {
            if (state.retryTimer) {
                this.timerAdapter.clearTimeout(state.retryTimer);
                state.retryTimer = null;
            }
        }
        const killed = this.forceKillAll();
        if (killed.length > 0) {
            logger.info({ killed }, 'shutdown: force-killed active containers');
        }
    }
    getGroupState(groupJid) {
        let state = this.groups.get(groupJid);
        if (!state) {
            state = {
                active: false,
                idleWaiting: false,
                isStandbyWorker: false,
                isTaskContainer: false,
                pendingMessages: false,
                pendingTasks: [],
                process: null,
                containerName: null,
                groupFolder: null,
                activeProvider: null,
                retry: this.retryPolicy.createMetadata(),
                pendingIdempotencyKeys: new Set(),
                retryTimer: null,
            };
            this.groups.set(groupJid, state);
        }
        return state;
    }
    async runForGroup(groupJid, reason) {
        const state = this.getGroupState(groupJid);
        state.active = true;
        state.idleWaiting = false;
        state.isStandbyWorker = false;
        state.isTaskContainer = false;
        state.pendingMessages = false;
        state.pendingIdempotencyKeys.clear();
        this.activeCount++;
        this.checkBackpressure();
        logger.debug({ groupJid, reason, activeCount: this.activeCount }, 'Platform queue starting group execution');
        try {
            if (this.executionHandler) {
                const success = await this.executionHandler(groupJid);
                if (success) {
                    this.retryPolicy.onSuccess(state.retry);
                }
                else {
                    this.handleExecutionFailure(groupJid, state, 'execution_returned_false');
                }
            }
        }
        catch (err) {
            logger.error({ groupJid, err }, 'Execution handler failed');
            const message = err instanceof Error ? err.message : 'execution_error';
            this.handleExecutionFailure(groupJid, state, message);
        }
        finally {
            state.active = false;
            state.process = null;
            state.containerName = null;
            state.groupFolder = null;
            state.activeProvider = null;
            this.activeCount = Math.max(0, this.activeCount - 1);
            this.checkBackpressure();
            this.drainGroup(groupJid);
        }
    }
    handleExecutionFailure(groupJid, state, failureReason) {
        const nowMs = this.now();
        const decision = this.retryPolicy.onFailure(state.retry, nowMs, failureReason);
        if (decision.action === 'poison') {
            logger.error({ groupJid, retryCount: state.retry.retryCount }, 'Max retries exceeded, dropping queued execution request');
            this.alertAdapter.publishQueueDrop({
                type: 'queue_drop',
                groupJid,
                retryCount: this.maxRetries,
                ts: nowMs,
            });
            state.pendingMessages = false;
            state.pendingIdempotencyKeys.clear();
            this.retryPolicy.resetAfterPoison(state.retry);
            return;
        }
        state.pendingMessages = true;
        this.scheduleRetry(groupJid, state, decision.delayMs);
        this.checkBackpressure();
    }
    scheduleRetry(groupJid, state, delayMs) {
        if (state.retryTimer) {
            this.timerAdapter.clearTimeout(state.retryTimer);
            state.retryTimer = null;
        }
        state.retryTimer = this.timerAdapter.setTimeout(() => {
            state.retryTimer = null;
            if (!this.shuttingDown) {
                this.requestExecution(groupJid);
            }
        }, delayMs);
    }
    async runTask(groupJid, task) {
        const state = this.getGroupState(groupJid);
        state.active = true;
        state.idleWaiting = false;
        state.isStandbyWorker = false;
        state.isTaskContainer = true;
        this.activeCount++;
        try {
            await task.fn();
        }
        catch (err) {
            logger.error({ groupJid, taskId: task.id, err }, 'Task execution failed');
        }
        finally {
            state.active = false;
            state.isTaskContainer = false;
            state.process = null;
            state.containerName = null;
            state.groupFolder = null;
            state.activeProvider = null;
            this.activeCount = Math.max(0, this.activeCount - 1);
            this.drainGroup(groupJid);
        }
    }
    drainGroup(groupJid) {
        if (this.shuttingDown)
            return;
        const state = this.getGroupState(groupJid);
        if (state.pendingTasks.length > 0) {
            const nextTask = state.pendingTasks.shift();
            this.runTask(groupJid, nextTask).catch((err) => logger.error({ groupJid, taskId: nextTask.id, err }, 'Unhandled error draining task queue'));
            return;
        }
        if (state.pendingMessages) {
            if (state.retryTimer) {
                return;
            }
            this.runForGroup(groupJid, 'drain').catch((err) => logger.error({ groupJid, err }, 'Unhandled error draining message queue'));
            return;
        }
        this.drainWaiting();
    }
    drainWaiting() {
        while (this.waitingGroups.length > 0 && this.activeCount < this.maxConcurrent) {
            const nextGroupJid = this.waitingGroups.shift();
            const state = this.getGroupState(nextGroupJid);
            if (state.pendingTasks.length > 0) {
                const nextTask = state.pendingTasks.shift();
                this.runTask(nextGroupJid, nextTask).catch((err) => logger.error({ groupJid: nextGroupJid, taskId: nextTask.id, err }, 'Unhandled error in waiting task drain'));
            }
            else if (state.pendingMessages) {
                if (state.retryTimer) {
                    continue;
                }
                this.runForGroup(nextGroupJid, 'drain').catch((err) => logger.error({ groupJid: nextGroupJid, err }, 'Unhandled error in waiting message drain'));
            }
        }
    }
    checkBackpressure() {
        const depth = this.waitingGroups.length;
        if (depth >= QUEUE_DEPTH_ALERT_THRESHOLD) {
            logger.warn({ queueDepth: depth, threshold: QUEUE_DEPTH_ALERT_THRESHOLD, activeCount: this.activeCount }, 'Queue backpressure: waiting group depth exceeds alert threshold');
        }
        else {
            logger.debug({ queueDepth: depth, activeCount: this.activeCount }, 'Queue depth check');
        }
    }
}
//# sourceMappingURL=platform-queue-service.js.map