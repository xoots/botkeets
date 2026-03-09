/**
 * Task State Manager
 *
 * The source of truth for multi-model compaction safety.
 *
 * Problem: The Claude Code team's compaction approach assumes one large-context
 * model. Our agent uses qwen3:8b (8k-32k ctx), smollm2 (2k ctx), and cloud
 * models (200k ctx). A prose summary safe for Claude is literally unreadable
 * by smollm2 and borderline for qwen3.
 *
 * Solution — three-layer state:
 *
 *   1. task_state.json  (structured machine facts, always current, always small)
 *      Updated after every step. Never summarised — it's ground truth.
 *      Any model can read this without hallucination because it's structured facts.
 *
 *   2. Anchor injection  (generated from task_state.json per-call, sized to model)
 *      Injected as a user message turn before each model call — never in the
 *      system prompt (cache-safe). The orchestrator generates it, not the model,
 *      so no hallucination risk. Sizes: full (Claude/OR) / medium (qwen3:8b) /
 *      minimal (smollm2).
 *
 *   3. narrative field  (optional prose summary for large-context models only)
 *      Written by Claude/OpenRouter compaction. Small models ignore this field
 *      entirely — they work from the structured facts + anchor only.
 *
 * Local models NEVER see conversation history.
 * They only ever get: system prompt + their specific subtask + anchor.
 * Hallucination is eliminated because anchors are serialised facts, not prose.
 */
import { PlanSubtask } from './project-planner.js';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export interface StepRecord {
    step: number;
    description: string;
    tool: string;
    status: StepStatus;
    startedAt?: string;
    completedAt?: string;
    /** Key outputs: file paths, API responses, bash stdout snippets (truncated) */
    outputs: string[];
    error?: string;
}
export interface TaskState {
    /** Workspace/project ID */
    projectId: string;
    workspaceDir: string;
    outputDir: string;
    /** One-line task summary (≤80 chars, safe for all models) */
    taskSummary: string;
    /** Credentials loaded (keys only — values never stored here) */
    credentialKeys: string[];
    /** Step tracking */
    steps: StepRecord[];
    currentStep: number;
    totalSteps: number;
    status: 'planning' | 'clarifying' | 'executing' | 'complete' | 'failed';
    /** Timestamps */
    createdAt: string;
    updatedAt: string;
    /**
     * Optional prose narrative — only written/read by large-context models.
     * Kept in state for completeness but NEVER injected into local model calls.
     */
    narrative?: string;
}
export declare function loadTaskState(projectId: string, workspaceDir: string): TaskState | null;
export declare function saveTaskState(state: TaskState): void;
export declare function initTaskState(projectId: string, workspaceDir: string, outputDir: string, taskSummary: string, subtasks: PlanSubtask[], credentialKeys?: string[]): TaskState;
export declare function markStepStarted(state: TaskState, step: number): void;
export declare function markStepDone(state: TaskState, step: number, outputs?: string[]): void;
export declare function markStepFailed(state: TaskState, step: number, error: string): void;
/**
 * Generate a context anchor from task_state.json, sized for the target model's
 * context window. Injected as a user message (not system prompt) before each call.
 *
 * @param state         Current task state
 * @param contextTokens Approximate context window of the target model (tokens)
 */
export declare function generateAnchor(state: TaskState, contextTokens: number): string;
/**
 * Look up approximate context window for a known model.
 * Used to pick the right anchor size.
 */
export declare function getModelContextTokens(model: string): number;
//# sourceMappingURL=task-state.d.ts.map