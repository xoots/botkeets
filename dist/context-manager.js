import { logger } from './logger.js';
import { COMPACTION_TRIGGER_PCT, CONTEXT_HARD_STOP_PCT, REBASE_TARGET_PCT, } from './config.js';
import { resolveEffectiveOllamaBaseUrl, resolveEffectiveOllamaModel } from './keet-provider-config.js';
import fs from 'fs';
// ── Constants ──────────────────────────────────────────────────────────────
// Token estimation: 1 token ≈ 4 chars (fast approximation)
const CHARS_PER_TOKEN = 4;
// Context limits per model family (tokens)
const MODEL_CONTEXT_LIMITS = {
    'claude': 200_000,
    'sonnet': 200_000,
    'haiku': 200_000,
    'opus': 200_000,
    'qwen3:8b': 8_000,
    'qwen3:32b': 32_000,
    'qwen-flash': 128_000,
    'deepseek': 128_000,
    'default': 8_000,
};
// Dex Horthy's "dumb zone" threshold — 40% of context limit
const BUDGET_THRESHOLD = COMPACTION_TRIGGER_PCT;
const HARD_STOP_THRESHOLD = CONTEXT_HARD_STOP_PCT;
// Keep last N tool results uncompressed — SWE-Agent pattern
const RECENT_TURNS_UNCOMPRESSED = 5;
// ── Token estimation ───────────────────────────────────────────────────────
export function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
export function estimateMessagesTokens(messages) {
    return messages.reduce((n, m) => n + estimateTokens(m.content) + 4, 0); // +4 per message for role overhead
}
export function getSessionStateFromHistory(sessionId, historyPath, anchorTokens, model) {
    if (!sessionId || !fs.existsSync(historyPath)) {
        return {
            session_id: sessionId,
            context_usage_tokens: 0,
            compaction_count: 0,
            anchor_cap_remaining: Math.max(0, getContextLimit(model) - anchorTokens),
            found: false,
        };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        const messages = Array.isArray(raw.messages)
            ? raw.messages
                .filter((msg) => (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string')
                .map((msg) => ({ role: msg.role, content: msg.content }))
            : [];
        const contextUsageTokens = estimateMessagesTokens(messages);
        const compactionCount = messages.filter((msg) => msg.content.includes('<compressed-history>')).length;
        const anchorCapRemaining = Math.max(0, getContextLimit(model) - anchorTokens - contextUsageTokens);
        return {
            session_id: sessionId,
            context_usage_tokens: contextUsageTokens,
            compaction_count: compactionCount,
            anchor_cap_remaining: anchorCapRemaining,
            found: true,
        };
    }
    catch {
        return {
            session_id: sessionId,
            context_usage_tokens: 0,
            compaction_count: 0,
            anchor_cap_remaining: Math.max(0, getContextLimit(model) - anchorTokens),
            found: false,
        };
    }
}
// ── Context limit lookup ───────────────────────────────────────────────────
export function getContextLimit(model) {
    const lower = model.toLowerCase();
    for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
        if (lower.includes(key))
            return limit;
    }
    return MODEL_CONTEXT_LIMITS.default;
}
// ── Budget gate ────────────────────────────────────────────────────────────
/**
 * Check whether a message array is approaching the model's context limit.
 * Returns budget info. Caller decides whether to compress.
 */
export function checkContextBudget(messages, model) {
    const limitTokens = getContextLimit(model);
    const estimatedTokens = estimateMessagesTokens(messages);
    const usedPercent = estimatedTokens / limitTokens;
    const overBudget = usedPercent >= BUDGET_THRESHOLD;
    const hardStopExceeded = usedPercent >= HARD_STOP_THRESHOLD;
    if (hardStopExceeded) {
        logger.error({
            estimatedTokens,
            limitTokens,
            usedPercent: `${(usedPercent * 100).toFixed(1)}%`,
            triggerPct: BUDGET_THRESHOLD,
            hardStopPct: HARD_STOP_THRESHOLD,
            model,
        }, 'Context hard-stop exceeded');
    }
    else if (overBudget) {
        logger.warn({
            estimatedTokens,
            limitTokens,
            usedPercent: `${(usedPercent * 100).toFixed(1)}%`,
            triggerPct: BUDGET_THRESHOLD,
            rebaseTargetPct: REBASE_TARGET_PCT,
            model,
        }, 'Context budget exceeded — compression needed');
    }
    else {
        logger.debug({
            estimatedTokens,
            limitTokens,
            usedPercent: `${(usedPercent * 100).toFixed(1)}%`,
        }, 'Context budget OK');
    }
    return { estimatedTokens, limitTokens, usedPercent, overBudget, hardStopExceeded };
}
// ── Observation compression ────────────────────────────────────────────────
/**
 * Compress a message array by collapsing old turns to one-liners.
 * Keeps the last RECENT_TURNS_UNCOMPRESSED messages intact — SWE-Agent pattern.
 * Uses qwen3:8b locally (free, fast) for summarisation.
 *
 * @param messages   Full message history
 * @returns          Compressed message array
 */
export async function compressMessages(messages) {
    if (messages.length <= RECENT_TURNS_UNCOMPRESSED)
        return messages;
    const toCompress = messages.slice(0, messages.length - RECENT_TURNS_UNCOMPRESSED);
    const recent = messages.slice(messages.length - RECENT_TURNS_UNCOMPRESSED);
    logger.info({
        total: messages.length,
        compressing: toCompress.length,
        keeping: recent.length,
    }, 'Compressing old messages');
    // Summarise the old turns into a single compact context block
    const historyText = toCompress
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n\n');
    const summaryPrompt = `Summarise the following agent conversation history into a compact bullet list.
Each bullet must capture: what was attempted, what the outcome was, and any key file paths or values produced.
Maximum 10 bullets. Be terse. No preamble.

HISTORY:
${historyText.slice(0, 12000)}`;
    let summary = '';
    const ollama = resolveEffectiveOllamaBaseUrl(process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
    const compressionModel = resolveEffectiveOllamaModel(process.env.OLLAMA_MODEL || 'qwen3:8b');
    try {
        const resp = await fetch(`${ollama.base_url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: compressionModel.model,
                prompt: summaryPrompt,
                stream: false,
                options: { num_predict: 400, temperature: 0 },
            }),
        });
        const data = await resp.json();
        summary = data.response?.trim() ?? '';
    }
    catch (err) {
        logger.warn({ err, compressionAuthority: compressionModel.authority }, 'Compression call failed — using truncated history');
        // Fallback: just keep a char-truncated version
        summary = historyText.slice(0, 2000) + '\n[...history truncated...]';
    }
    const compressedMsg = {
        role: 'user',
        content: `<compressed-history>\n${summary}\n</compressed-history>`,
    };
    const result = [compressedMsg, ...recent];
    logger.info({
        beforeTokens: estimateMessagesTokens(messages),
        afterTokens: estimateMessagesTokens(result),
    }, 'Compression complete');
    return result;
}
// ── Main entry point ───────────────────────────────────────────────────────
/**
 * Gate function — call this before every model invocation.
 * Checks budget, compresses if needed, returns the (possibly compressed) messages.
 *
 * @param messages   Current message array
 * @param model      Model string (used to look up context limit)
 * @returns          Safe message array ready for model call
 */
export async function prepareMessages(messages, model) {
    const budget = checkContextBudget(messages, model);
    if (!budget.overBudget)
        return messages;
    return compressMessages(messages);
}
// ── Legacy export (backwards compat with any existing callers) ────────────
export async function prepareContext(prompt, model) {
    const budget = checkContextBudget([{ role: 'user', content: prompt }], model);
    if (!budget.overBudget)
        return prompt;
    const compressed = await compressMessages([{ role: 'user', content: prompt }]);
    return compressed.map(m => m.content).join('\n');
}
//# sourceMappingURL=context-manager.js.map