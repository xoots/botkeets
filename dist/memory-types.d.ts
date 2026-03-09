export type SignalType = 'direct_query' | 'semantic_proximity' | 'task_completion' | 'step_execution' | 'step_failure';
export interface SignalEvent {
    ts_unix: number;
    signal_type: SignalType;
    weight: number;
    task_id?: string;
    embedding_distance?: number;
    parent_id?: string;
}
export interface ProjectMemory {
    project_id: string;
    last_touched_unix: number;
    signal_log: SignalEvent[];
    task_embeddings: number[][];
    canonical_summary: string;
}
export interface CanonWeights {
    alpha: number;
    beta: number;
    gamma: number;
}
export declare const MVP_WEIGHTS: CanonWeights;
export type ModelTier = 'CLAUDE' | 'QWEN_MAX' | 'QWEN_PLUS' | 'QWEN_CODER' | 'DEEPSEEK';
export type ModelCategory = 'FULL' | 'SMALL';
export type WarmthTier = 'HOT' | 'WARM' | 'COLD';
export interface AnchorTier {
    model_tier: ModelTier;
    warmth_tier: WarmthTier;
}
export interface AssembledAnchor {
    content: string;
    token_count: number;
    tier: AnchorTier;
    project_id: string | null;
    canon_score: number;
}
export interface MVPSubagentReturn {
    agent_type: string;
    summary: string;
    key_findings: string[];
    confidence: number;
    tokens_used: number;
}
export interface MemoryTokenLogEntry {
    ts: string;
    session_id: string;
    project_id: string | null;
    tier: string;
    anchor_tokens: number;
    saved_vs_full: number;
}
export interface ParallelConfig {
    maxConcurrent: 1 | 2 | 3;
    explicit: boolean;
}
export interface PlanApprovalConfig {
    required: boolean;
    skipRequested: boolean;
}
export type ExecutionHint = 'deterministic_fetch' | 'deterministic_read_file' | 'deterministic_git' | 'deterministic_shell' | 'model_required';
export interface MicroTask {
    id: string;
    parent_task_id: string;
    title: string;
    description: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    priority: number;
    created_at_unix: number;
    execution_hint?: ExecutionHint;
}
export interface StagingEntry {
    id: string;
    project_id: string;
    content: string;
    entry_type: 'micro_task' | 'memory_fragment' | 'signal_batch';
    staged_at_unix: number;
    promoted: boolean;
    metadata?: Record<string, unknown>;
}
export interface DripFeedConfig {
    batch_size: number;
    interval_seconds: number;
    max_pending: number;
    auto_promote: boolean;
}
//# sourceMappingURL=memory-types.d.ts.map