export interface ExecutionRunHistoryEntry {
    ts: string;
    task_id: string;
    chat_jid: string;
    path_used: 'keet' | 'copaw' | 'fallback';
    lane_used?: 'copaw_orchestrator' | 'keet_execution';
    success: boolean;
    fallback_reason?: string;
    latency_ms: number;
    mcp_executed_steps?: string[];
}
export declare function appendExecutionRunHistory(entry: ExecutionRunHistoryEntry): void;
export declare function readExecutionRunHistory(limit?: number, cursor?: number): {
    runs: ExecutionRunHistoryEntry[];
    next_cursor: number;
};
//# sourceMappingURL=execution-run-history.d.ts.map