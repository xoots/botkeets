/**
 * Task Registry
 *
 * Single source of truth for all active and recently completed agent tasks.
 * Drives the monitoring loop, PR automation, and Telegram notifications.
 *
 * Persisted to <PROJECT_ROOT>/active-tasks.json — survives process restarts.
 * In-memory map is hydrated at import time, so reads are synchronous and free.
 */
export type TaskStatus = 'running' | 'awaiting_pro_shard_approval' | 'pr_open' | 'ci_passed' | 'done' | 'failed';
export interface TaskEntry {
    /** Workspace id, e.g. "2026-03-01-headless-spotify" */
    id: string;
    /** Group JID for notifications, e.g. "tg:123456" or "dc:987654" */
    jid: string;
    /** Absolute path to <project>/workspace/ — used for git ops and CI checks */
    workspaceDir: string;
    /** ≤80 char task description pulled from the original user message */
    summary: string;
    /** Git branch name — "feat/<id>" by default */
    branch: string;
    status: TaskStatus;
    prNumber: number | null;
    prUrl: string | null;
    /** Unix ms timestamp when task was registered */
    startedAt: number;
    /** Unix ms timestamp when task reached a terminal state */
    completedAt: number | null;
    overseerRetries?: number;
    overseerDecision?: string;
    overseerReason?: string;
    preflightOk?: boolean;
    preflightErrors?: string[];
    preflightWarnings?: string[];
    providerCompatibility?: {
        provider_id?: string;
        model?: string;
        compatible_with_keet?: boolean;
    };
    mcpSummary?: {
        enabled: number;
        healthy: number;
        degraded: number;
    };
    mcpExecutedSteps?: string[];
}
/**
 * Register a new task when execution begins.
 * Overwrites any existing entry with the same id (e.g. on retry).
 */
export declare function registerTask(entry: Pick<TaskEntry, 'id' | 'jid' | 'workspaceDir' | 'summary' | 'branch'>): TaskEntry;
/**
 * Patch any fields on an existing entry.
 * Silently no-ops if the id is unknown (safe to call speculatively).
 */
export declare function updateTask(id: string, patch: Partial<TaskEntry>): void;
export declare function getTask(id: string): TaskEntry | null;
export declare function getAllTasks(): TaskEntry[];
export declare function getTasksByStatus(status: TaskStatus): TaskEntry[];
/**
 * Remove tasks that reached a terminal state more than `olderThanMs` ago.
 * Default: 7 days. Returns the number of entries pruned.
 */
export declare function pruneCompleted(olderThanMs?: number): number;
//# sourceMappingURL=task-registry.d.ts.map