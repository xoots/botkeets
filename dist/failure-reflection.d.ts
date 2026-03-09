/**
 * Failure Reflection — root-cause analysis on micro-task failures.
 * 5s hard timeout. Safe default on any failure: { action: 'retry', confidence: 0.3 }.
 * Reuses: Ollama call pattern from micro-task-decomposer.ts
 */
export type ReflectionAction = 'retry' | 'retry_modified' | 'escalate' | 'skip';
export interface ReflectionResult {
    action: ReflectionAction;
    root_cause: string;
    modified_prompt?: string;
    confidence: number;
}
export declare function reflectOnFailure(taskDescription: string, errorMessage: string, attempt: number, previousResults?: string): Promise<ReflectionResult>;
//# sourceMappingURL=failure-reflection.d.ts.map