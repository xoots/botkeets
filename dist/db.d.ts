import { NewMessage, RegisteredGroup, ScheduledTask, TaskRunLog } from './types.js';
export declare function initDatabase(): void;
/** @internal - for tests only. Creates a fresh in-memory database. */
export declare function _initTestDatabase(): void;
/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export declare function storeChatMetadata(chatJid: string, timestamp: string, name?: string, channel?: string, isGroup?: boolean): void;
/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export declare function updateChatName(chatJid: string, name: string): void;
export interface ChatInfo {
    jid: string;
    name: string;
    last_message_time: string;
    channel: string;
    is_group: number;
}
/**
 * Get all known chats, ordered by most recent activity.
 */
export declare function getAllChats(): ChatInfo[];
/**
 * Get timestamp of last group metadata sync.
 */
export declare function getLastGroupSync(): string | null;
/**
 * Record that group metadata was synced.
 */
export declare function setLastGroupSync(): void;
/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export declare function storeMessage(msg: NewMessage): void;
/**
 * Store a message directly (for non-WhatsApp channels that don't use Baileys proto).
 */
export declare function storeMessageDirect(msg: {
    id: string;
    chat_jid: string;
    sender: string;
    sender_name: string;
    content: string;
    timestamp: string;
    is_from_me: boolean;
    is_bot_message?: boolean;
}): void;
export declare function getNewMessages(jids: string[], perGroupTimestamps: Record<string, string> | string, botPrefix: string): {
    messages: NewMessage[];
    newTimestamp: string;
};
export declare function getMessagesSince(chatJid: string, sinceTimestamp: string, botPrefix: string): NewMessage[];
export declare function getRegisteredGroup(jid: string): RegisteredGroup & {
    jid: string;
} | undefined;
export declare function setRegisteredGroup(jid: string, group: RegisteredGroup): void;
export declare function deleteRegisteredGroup(jid: string): boolean;
export declare function getAllRegisteredGroups(): Record<string, RegisteredGroup>;
export declare function createTask(task: Omit<ScheduledTask, 'last_run' | 'last_result'>): void;
export declare function getTaskById(id: string): ScheduledTask | undefined;
export declare function getTasksForGroup(groupFolder: string): ScheduledTask[];
export declare function getAllTasks(): ScheduledTask[];
export declare function updateTask(id: string, updates: Partial<Pick<ScheduledTask, 'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status' | 'provider_override'>>): void;
export declare function deleteTask(id: string): void;
export declare function getDueTasks(): ScheduledTask[];
export declare function updateTaskAfterRun(id: string, nextRun: string | null, lastResult: string): void;
export declare function logTaskRun(log: TaskRunLog): void;
export interface TaskAnalytics {
    group_folder: string;
    total_runs: number;
    success_rate: number;
    avg_duration_ms: number;
}
export declare function getTaskAnalytics(): TaskAnalytics[];
export declare function getRecentRunLogs(limit?: number): TaskRunLog[];
export declare function getRouterState(key: string): string | undefined;
export declare function setRouterState(key: string, value: string): void;
export declare function getSession(groupFolder: string, provider: string): string | undefined;
export declare function setSession(groupFolder: string, provider: string, sessionId: string): void;
/** Returns all sessions as { groupFolder: { provider: sessionId } } */
export declare function getAllSessions(): Record<string, Record<string, string>>;
export interface EvolutionSuggestion {
    id: string;
    group_folder: string;
    suggestion_type: 'skill' | 'memory';
    title: string;
    content: string;
    reason: string | null;
    suggested_at: string;
    re_evaluate_at: string;
    status: 'pending' | 'suggested' | 'approved' | 'rejected';
    slug: string | null;
    created_at: string;
}
export declare function insertEvolutionSuggestion(suggestion: Omit<EvolutionSuggestion, 'created_at'>): void;
export declare function getEvolutionSuggestionsForReEvaluation(): EvolutionSuggestion[];
export declare function getSuggestedEvolutionForGroup(groupFolder: string): EvolutionSuggestion | undefined;
export declare function updateEvolutionSuggestionStatus(id: string, status: EvolutionSuggestion['status']): void;
export declare function getLastReflectionAt(groupFolder: string): string | null;
export declare function setLastReflectionAt(groupFolder: string, iso: string): void;
export declare function getProjectMemory(projectId: string): {
    project_id: string;
    last_touched_unix: number;
    task_embeddings: string;
    canonical_summary: string;
} | undefined;
export declare function upsertProjectMemory(projectId: string, lastTouchedUnix: number, taskEmbeddings: number[][], canonicalSummary: string): void;
export declare function upsertCanonicalSummary(projectId: string, summary: string): void;
/**
 * Append to a project's canonical summary without replacing existing content.
 * Deduplicates by session tag — if sessionTag already in summary, skips.
 */
export declare function appendCanonicalSummary(projectId: string, sessionTag: string, newContent: string): void;
export declare function appendTaskEmbedding(projectId: string, embedding: number[]): void;
export declare function insertMemorySignal(projectId: string, tsUnix: number, signalType: string, weight: number, taskId?: string, embeddingDistance?: number, parentId?: string): void;
export declare function getMemorySignalsForProject(projectId: string, sinceUnix: number): Array<{
    ts_unix: number;
    signal_type: string;
    weight: number;
}>;
export declare function insertMemoryTokenLog(sessionId: string, projectId: string | null, tier: string, anchorTokens: number, savedVsFull: number): void;
export declare function markMessagesProcessed(msgs: Array<{
    id: string;
    chat_jid: string;
}>): void;
export declare function filterUnprocessedMessages(msgs: NewMessage[]): NewMessage[];
export declare function pruneProcessedMessages(retentionMs: number): number;
//# sourceMappingURL=db.d.ts.map