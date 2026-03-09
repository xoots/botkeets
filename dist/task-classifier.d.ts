/**
 * Task Classifier
 *
 * Uses qwen3:8b locally to classify each message before spending any cloud tokens.
 * Falls back to a fast rule-based heuristic if Ollama is unavailable.
 *
 * Output schema:
 * {
 *   task_type:        'social' | 'chat' | 'business' | 'research' | 'code' | 'complex'
 *   complexity:       'low' | 'medium' | 'high'
 *   quality_stakes:   'low' | 'medium' | 'high'   // how bad is a wrong answer?
 *   recommended_mode: 'eco' | 'standard' | 'pro'
 *   reasoning:        string  (brief, ≤ 20 words)
 *   agent_type?:      'general' | 'code' | 'research' | 'creative'  // routing hint
 *   model_tier?:      'eco' | 'standard' | 'pro'                    // model capability tier
 *   project_id?:      string | null                                  // inferred project
 * }
 *
 * The classifier result drives the mode-router to pick the right provider tier.
 * With /think disabled (qwen3 default off), classification takes ~200-400ms.
 */
import { Mode } from './mode-manager.js';
export type TaskType = 'social' | 'chat' | 'business' | 'research' | 'code' | 'complex';
export type Complexity = 'low' | 'medium' | 'high';
export type QualityStakes = 'low' | 'medium' | 'high';
export interface ClassifierResult {
    task_type: TaskType;
    complexity: Complexity;
    quality_stakes: QualityStakes;
    recommended_mode: Mode;
    reasoning: string;
    agent_type?: string;
    model_tier?: string;
    project_id?: string | null;
}
export declare function classifyTaskReadOnly(content: string): ClassifierResult & {
    usedFallback: boolean;
};
/**
 * Classify a message, trying qwen3:8b first, falling back to rule-based.
 *
 * @param content  The raw message text (already stripped of trigger/override prefix)
 * @param useLocal Whether to attempt the Ollama classifier (default: true)
 */
export declare function classifyTask(content: string, useLocal?: boolean): Promise<ClassifierResult & {
    usedFallback: boolean;
}>;
//# sourceMappingURL=task-classifier.d.ts.map