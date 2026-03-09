/**
 * Micro-Task Decomposer
 *
 * Takes a complex task description → outputs ordered MicroTask[] via qwen3:8b.
 * Micro-tasks are smaller/more focused than PlanSubtask — atomic units that
 * fit a single model call.
 *
 * Reuses: Ollama call pattern from project-planner.ts / task-classifier.ts
 */
import type { MicroTask } from './memory-types.js';
/**
 * Decompose a complex task into ordered micro-tasks using local Ollama.
 * Returns empty array on any failure (graceful degradation).
 */
export declare function decomposeTask(taskDescription: string, parentTaskId: string): Promise<MicroTask[]>;
//# sourceMappingURL=micro-task-decomposer.d.ts.map