/**
 * Overseer — evaluates TaskRunResult and decides complete / reprompt / escalate.
 * Uses DashScope qwen-plus as reasoning model — cheap, no OpenRouter tax.
 */
import { DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL } from './config.js';
import { logger } from './logger.js';
import { getTask, updateTask } from './task-registry.js';
import { FALLBACK_CHAINS } from './provider-registry.js';
import { resolveEffectiveProviderCredential } from './keet-provider-config.js';
const OVERSEER_MAX_RETRIES = parseInt(process.env.OVERSEER_MAX_RETRIES || '2', 10);
const OVERSEER_SYSTEM = `You are a task overseer. A coding agent just attempted a task and returned a result.
Evaluate whether the task succeeded, failed recoverably, or is stuck.

Respond with ONLY valid JSON:
{
  "decision": "complete" | "reprompt" | "escalate",
  "reason": "one sentence explanation",
  "newPrompt": "revised prompt if decision is reprompt, otherwise empty string"
}

Rules:
- complete: task succeeded or output is good enough to ship
- reprompt: task failed but the error is clear and fixable with a better prompt
- escalate: task failed in a way that needs human judgment (ambiguous requirements, missing credentials, architectural decision)
- newPrompt must be a concrete revised instruction, not a vague retry
- Return ONLY the JSON. No markdown fences. No extra text.`;
export async function evaluateResult(taskId, taskSummary, result, verificationSummary) {
    const entry = getTask(taskId);
    const retries = entry?.overseerRetries ?? 0;
    if (retries >= OVERSEER_MAX_RETRIES) {
        const reason = `Exceeded overseer retry limit (${OVERSEER_MAX_RETRIES}) — escalating to human`;
        logger.warn({ taskId, retries }, reason);
        updateTask(taskId, { overseerDecision: 'escalate', overseerReason: reason });
        return { action: 'escalate', reason };
    }
    if (result.success && !result.escapeHatchTriggered) {
        updateTask(taskId, { overseerDecision: 'complete', overseerReason: 'Task succeeded in structured mode' });
        return { action: 'complete' };
    }
    const dashscopeDefault = resolveEffectiveProviderCredential('dashscope', DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL);
    if (!dashscopeDefault.api_key) {
        const reason = 'No DASHSCOPE_API_KEY — cannot evaluate failure, escalating';
        logger.warn({ taskId }, reason);
        return { action: 'escalate', reason };
    }
    const userMessage = [
        `Task: ${taskSummary}`,
        ``,
        `Result:`,
        `  success: ${result.success}`,
        `  stepsCompleted: ${result.stepsCompleted}`,
        `  stepsFailed: ${result.stepsFailed}`,
        `  escapeHatchTriggered: ${result.escapeHatchTriggered}`,
        `  finalMode: ${result.finalMode}`,
        `  outputs:`,
        result.outputs.map(o => `    - ${o.slice(0, 300)}`).join('\n'),
        ...(verificationSummary ? [``, `Verification report:`, verificationSummary] : []),
    ].join('\n');
    try {
        // Walk overseer chain — eco_brain first, escalate to std_brain/pro_brain on failure
        const chain = FALLBACK_CHAINS.overseer;
        let raw = '';
        for (const entry of chain) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60_000);
                let baseUrl;
                let apiKey;
                if (entry.provider === 'dashscope') {
                    const dashscope = resolveEffectiveProviderCredential('dashscope', DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL);
                    baseUrl = dashscope.base_url;
                    apiKey = dashscope.api_key;
                }
                else if (entry.provider === 'deepseek') {
                    const deepseek = resolveEffectiveProviderCredential('deepseek', DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL);
                    baseUrl = deepseek.base_url;
                    apiKey = deepseek.api_key;
                }
                else {
                    // claude or unknown — skip for now, Claude handled via container
                    continue;
                }
                if (!apiKey) {
                    logger.debug({ provider: entry.provider }, 'Overseer: no API key — skipping');
                    continue;
                }
                const resp = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: entry.model,
                        messages: [
                            { role: 'system', content: OVERSEER_SYSTEM },
                            { role: 'user', content: userMessage },
                        ],
                        max_tokens: 400,
                        temperature: 0,
                    }),
                });
                clearTimeout(timeoutId);
                if (!resp.ok) {
                    logger.warn({ provider: entry.provider, model: entry.model, status: resp.status }, 'Overseer provider failed — trying next');
                    continue;
                }
                const data = (await resp.json());
                raw = data?.choices?.[0]?.message?.content?.trim() ?? '';
                if (raw)
                    break; // got a response — stop walking chain
            }
            catch (err) {
                logger.warn({ provider: entry.provider, model: entry.model, err }, 'Overseer provider error — trying next');
            }
        }
        if (!raw)
            throw new Error('All overseer providers exhausted');
        const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(jsonStr);
        updateTask(taskId, {
            overseerDecision: parsed.decision,
            overseerReason: parsed.reason,
            overseerRetries: retries + (parsed.decision === 'reprompt' ? 1 : 0),
        });
        logger.info({ taskId, decision: parsed.decision, reason: parsed.reason }, 'Overseer decision');
        if (parsed.decision === 'complete')
            return { action: 'complete' };
        if (parsed.decision === 'reprompt')
            return { action: 'reprompt', newPrompt: parsed.newPrompt };
        return { action: 'escalate', reason: parsed.reason };
    }
    catch (err) {
        const reason = `Overseer reasoning failed: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn({ taskId, err }, reason);
        updateTask(taskId, { overseerDecision: 'escalate', overseerReason: reason });
        return { action: 'escalate', reason };
    }
}
//# sourceMappingURL=overseer.js.map