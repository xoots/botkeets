/**
 * Staging Cache
 *
 * In-memory Map blackboard for micro-task results with status tracking.
 * Optional disk persistence to data/staging/<taskId>.json for crash recovery.
 *
 * Pure data structure — no side effects, no DB writes, no network calls.
 * Reuses: disk persistence pattern from task-registry.ts / clarification-store.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { MicroTaskArraySchema, safeParseWithFallback } from './drip-feed-schemas.js';
const STAGING_DIR = path.join(process.cwd(), 'data', 'staging');
// ---------------------------------------------------------------------------
// In-memory store: taskId → MicroTask[]
// ---------------------------------------------------------------------------
const cache = new Map();
/**
 * Load a task's micro-tasks from disk (crash recovery).
 * Returns empty array if no persisted state.
 */
export function loadFromDisk(taskId) {
    try {
        const file = path.join(STAGING_DIR, `${taskId}.json`);
        if (!fs.existsSync(file))
            return [];
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const data = safeParseWithFallback(raw, MicroTaskArraySchema, [], `staging-cache:${taskId}`);
        if (!Array.isArray(data))
            return [];
        cache.set(taskId, data);
        logger.debug({ taskId, count: data.length }, 'staging-cache: loaded from disk');
        return data;
    }
    catch (err) {
        logger.warn({ err, taskId }, 'staging-cache: disk load failed');
        return [];
    }
}
/**
 * Persist a task's micro-tasks to disk.
 */
function persistToDisk(taskId) {
    try {
        fs.mkdirSync(STAGING_DIR, { recursive: true });
        const tasks = cache.get(taskId) ?? [];
        fs.writeFileSync(path.join(STAGING_DIR, `${taskId}.json`), JSON.stringify(tasks, null, 2), 'utf-8');
    }
    catch (err) {
        logger.warn({ err, taskId }, 'staging-cache: persist failed');
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Stage micro-tasks for a parent task. Overwrites any existing entries. */
export function stage(taskId, tasks) {
    cache.set(taskId, tasks);
    persistToDisk(taskId);
}
/** Get all micro-tasks for a parent task. */
export function getAll(taskId) {
    return cache.get(taskId) ?? [];
}
/** Get the next pending micro-task (lowest priority number = highest priority). */
export function nextPending(taskId) {
    const tasks = cache.get(taskId);
    if (!tasks)
        return null;
    return tasks.find((t) => t.status === 'pending') ?? null;
}
/** Update a single micro-task's status. */
export function updateStatus(taskId, microTaskId, status) {
    const tasks = cache.get(taskId);
    if (!tasks)
        return;
    const task = tasks.find((t) => t.id === microTaskId);
    if (task) {
        task.status = status;
        persistToDisk(taskId);
    }
}
/** Check if all micro-tasks for a parent task are done or failed. */
export function isComplete(taskId) {
    const tasks = cache.get(taskId);
    if (!tasks || tasks.length === 0)
        return true;
    return tasks.every((t) => t.status === 'done' || t.status === 'failed');
}
/** Get summary counts by status. */
export function counts(taskId) {
    const tasks = cache.get(taskId) ?? [];
    const result = { pending: 0, running: 0, done: 0, failed: 0 };
    for (const t of tasks)
        result[t.status]++;
    return result;
}
/** Remove a task's entries from memory and disk. */
export function clear(taskId) {
    cache.delete(taskId);
    try {
        const file = path.join(STAGING_DIR, `${taskId}.json`);
        if (fs.existsSync(file))
            fs.unlinkSync(file);
    }
    catch { /* non-fatal */ }
}
//# sourceMappingURL=staging-cache.js.map