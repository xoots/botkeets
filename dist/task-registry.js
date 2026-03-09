/**
 * Task Registry
 *
 * Single source of truth for all active and recently completed agent tasks.
 * Drives the monitoring loop, PR automation, and Telegram notifications.
 *
 * Persisted to <PROJECT_ROOT>/active-tasks.json — survives process restarts.
 * In-memory map is hydrated at import time, so reads are synchronous and free.
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { emitSignal } from './memory-signal-emitter.js';
const REGISTRY_FILE = path.join(process.cwd(), 'active-tasks.json');
// ── In-memory store — hydrated from disk once at module load ──────────────────
let registry = {};
function load() {
    try {
        if (fs.existsSync(REGISTRY_FILE)) {
            registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
            logger.debug({ count: Object.keys(registry).length }, 'task-registry: loaded');
        }
    }
    catch (err) {
        logger.warn({ err }, 'task-registry: load failed, starting fresh');
        registry = {};
    }
}
function persist() {
    try {
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
    }
    catch (err) {
        logger.warn({ err }, 'task-registry: persist failed');
    }
}
load();
// ── API ───────────────────────────────────────────────────────────────────────
/**
 * Register a new task when execution begins.
 * Overwrites any existing entry with the same id (e.g. on retry).
 */
export function registerTask(entry) {
    const task = {
        ...entry,
        status: 'running',
        prNumber: null,
        prUrl: null,
        startedAt: Date.now(),
        completedAt: null,
    };
    registry[task.id] = task;
    persist();
    logger.info({ id: task.id, jid: task.jid }, 'task-registry: task registered');
    return task;
}
/**
 * Patch any fields on an existing entry.
 * Silently no-ops if the id is unknown (safe to call speculatively).
 */
export function updateTask(id, patch) {
    if (!registry[id]) {
        logger.debug({ id }, 'task-registry: updateTask skipped — unknown id');
        return;
    }
    registry[id] = { ...registry[id], ...patch };
    persist();
    // Memory signal: task_completion at terminal states — fire-and-forget
    const isTerminal = patch.status === 'done' || patch.status === 'failed' || patch.status === 'ci_passed';
    if (isTerminal) {
        setImmediate(() => {
            try {
                const task = registry[id];
                if (task) {
                    const wsSegments = task.workspaceDir.split('/').filter(Boolean);
                    const wsId = wsSegments[wsSegments.length - 1] ?? id;
                    emitSignal(wsId, 'task_completion', 1.0, id);
                }
            }
            catch { /* silently ignore */ }
        });
    }
}
export function getTask(id) {
    return registry[id] ?? null;
}
export function getAllTasks() {
    return Object.values(registry);
}
export function getTasksByStatus(status) {
    return Object.values(registry).filter((t) => t.status === status);
}
/**
 * Remove tasks that reached a terminal state more than `olderThanMs` ago.
 * Default: 7 days. Returns the number of entries pruned.
 */
export function pruneCompleted(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - olderThanMs;
    const before = Object.keys(registry).length;
    for (const [id, task] of Object.entries(registry)) {
        if ((task.status === 'done' || task.status === 'failed') &&
            task.completedAt !== null &&
            task.completedAt < cutoff) {
            delete registry[id];
        }
    }
    const removed = before - Object.keys(registry).length;
    if (removed > 0)
        persist();
    return removed;
}
//# sourceMappingURL=task-registry.js.map