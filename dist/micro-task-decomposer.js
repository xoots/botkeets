/**
 * Micro-Task Decomposer
 *
 * Takes a complex task description → outputs ordered MicroTask[] via qwen3:8b.
 * Micro-tasks are smaller/more focused than PlanSubtask — atomic units that
 * fit a single model call.
 *
 * Reuses: Ollama call pattern from project-planner.ts / task-classifier.ts
 */
import { logger } from './logger.js';
import { RawDecompositionSchema, safeParseWithFallback } from './drip-feed-schemas.js';
import { inferExecutionHint } from './deterministic-executor.js';
import { runLlm, stripMarkdownCodeFences } from './llm-router.js';
const DECOMPOSER_MODEL = process.env.DECOMPOSER_MODEL || 'qwen3:8b';
const SYSTEM_PROMPT = `You are a task decomposer. Given a complex task, break it into the smallest atomic micro-tasks that can each be completed in a single focused action.

Rules:
- Each micro-task must be independently describable in one sentence
- Order by dependency: earlier tasks must not depend on later ones
- Assign priority 1 (highest) to 5 (lowest) based on criticality
- Return JSON only, no markdown fences, no explanation
- Maximum 20 micro-tasks

Output schema:
{
  "micro_tasks": [
    {
      "title": "short imperative title",
      "description": "one-sentence description of what to do",
      "priority": 1
    }
  ]
}`;
/**
 * Decompose a complex task into ordered micro-tasks using local Ollama.
 * Returns empty array on any failure (graceful degradation).
 */
export async function decomposeTask(taskDescription, parentTaskId) {
    try {
        const raw = (await runLlm({
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Task: ${taskDescription}` },
            ],
            routes: [{
                    provider: 'ollama',
                    model: DECOMPOSER_MODEL,
                    timeoutMs: 20_000,
                    think: false,
                    temperature: 0.1,
                    numPredict: 2000,
                }],
        })).text.trim();
        const jsonStr = stripMarkdownCodeFences(raw);
        const parsed = safeParseWithFallback(JSON.parse(jsonStr), RawDecompositionSchema, { micro_tasks: [] }, 'micro-task-decomposer');
        if (!Array.isArray(parsed.micro_tasks))
            return [];
        const now = Date.now();
        return parsed.micro_tasks
            .filter((t) => t.title && t.description)
            .slice(0, 20)
            .map((t, i) => ({
            id: `${parentTaskId}-mt-${i}`,
            parent_task_id: parentTaskId,
            title: t.title,
            description: t.description,
            status: 'pending',
            priority: Math.min(Math.max(t.priority ?? 3, 1), 5),
            created_at_unix: now,
            execution_hint: inferExecutionHint(t.description),
        }));
    }
    catch (err) {
        logger.warn({ err }, 'micro-task decomposition failed — returning empty');
        return [];
    }
}
//# sourceMappingURL=micro-task-decomposer.js.map