/**
 * Failure Reflection — root-cause analysis on micro-task failures.
 * 5s hard timeout. Safe default on any failure: { action: 'retry', confidence: 0.3 }.
 * Reuses: Ollama call pattern from micro-task-decomposer.ts
 */
import { OLLAMA_HOST } from './config.js';
import { resolveEffectiveOllamaBaseUrl } from './keet-provider-config.js';
import { logger } from './logger.js';
const REFLECTION_MODEL = process.env.REFLECTION_MODEL || 'qwen3:8b';
const REFLECTION_TIMEOUT_MS = 5_000;
const REFLECTION_SYSTEM_PROMPT = `You are a failure analysis agent. A micro-task failed. Analyze the error and decide the best action.

Respond with ONLY valid JSON:
{
  "action": "retry" | "retry_modified" | "escalate" | "skip",
  "root_cause": "one-sentence root cause",
  "modified_prompt": "improved description if action is retry_modified, otherwise omit",
  "confidence": 0.8
}

Rules:
- "retry": transient error (timeout, rate limit, network)
- "retry_modified": prompt was unclear — provide improved prompt
- "escalate": task too complex for current model tier
- "skip": task impossible or blocked by external dependency
- Return ONLY JSON. No markdown fences.`;
const DEFAULT_RESULT = {
    action: 'retry',
    root_cause: 'Reflection unavailable — defaulting to retry',
    confidence: 0.3,
};
export async function reflectOnFailure(taskDescription, errorMessage, attempt, previousResults) {
    try {
        const ollama = resolveEffectiveOllamaBaseUrl(OLLAMA_HOST);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REFLECTION_TIMEOUT_MS);
        const userMessage = [
            `Failed task: ${taskDescription}`,
            `Error: ${errorMessage}`,
            `Attempt: ${attempt} of 3`,
            previousResults ? `Previous context: ${previousResults.slice(0, 500)}` : '',
        ]
            .filter(Boolean)
            .join('\n');
        const resp = await fetch(`${ollama.base_url}/api/chat`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: REFLECTION_MODEL,
                stream: false,
                think: false,
                options: { temperature: 0.1, num_predict: 300 },
                messages: [
                    { role: 'system', content: REFLECTION_SYSTEM_PROMPT },
                    { role: 'user', content: userMessage },
                ],
            }),
        });
        clearTimeout(timeoutId);
        if (!resp.ok)
            return DEFAULT_RESULT;
        const data = (await resp.json());
        const raw = data?.message?.content?.trim() ?? '';
        // Strip accidental markdown fences
        const jsonStr = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        const parsed = JSON.parse(jsonStr);
        const validActions = ['retry', 'retry_modified', 'escalate', 'skip'];
        if (!parsed.action || !validActions.includes(parsed.action))
            return DEFAULT_RESULT;
        return {
            action: parsed.action,
            root_cause: parsed.root_cause ?? 'Unknown',
            modified_prompt: parsed.action === 'retry_modified' ? parsed.modified_prompt : undefined,
            confidence: typeof parsed.confidence === 'number'
                ? Math.min(1, Math.max(0, parsed.confidence))
                : 0.5,
        };
    }
    catch (err) {
        logger.debug({ err }, 'failure-reflection: reflection call failed — using default');
        return DEFAULT_RESULT;
    }
}
//# sourceMappingURL=failure-reflection.js.map