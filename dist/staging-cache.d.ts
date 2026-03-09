/**
 * Staging Cache
 *
 * In-memory Map blackboard for micro-task results with status tracking.
 * Optional disk persistence to data/staging/<taskId>.json for crash recovery.
 *
 * Pure data structure — no side effects, no DB writes, no network calls.
 * Reuses: disk persistence pattern from task-registry.ts / clarification-store.ts
 */
import type { MicroTask } from './memory-types.js';
/**
 * Load a task's micro-tasks from disk (crash recovery).
 * Returns empty array if no persisted state.
 */
export declare function loadFromDisk(taskId: string): MicroTask[];
/** Stage micro-tasks for a parent task. Overwrites any existing entries. */
export declare function stage(taskId: string, tasks: MicroTask[]): void;
/** Get all micro-tasks for a parent task. */
export declare function getAll(taskId: string): MicroTask[];
/** Get the next pending micro-task (lowest priority number = highest priority). */
export declare function nextPending(taskId: string): MicroTask | null;
/** Update a single micro-task's status. */
export declare function updateStatus(taskId: string, microTaskId: string, status: MicroTask['status']): void;
/** Check if all micro-tasks for a parent task are done or failed. */
export declare function isComplete(taskId: string): boolean;
/** Get summary counts by status. */
export declare function counts(taskId: string): Record<MicroTask['status'], number>;
/** Remove a task's entries from memory and disk. */
export declare function clear(taskId: string): void;
//# sourceMappingURL=staging-cache.d.ts.map