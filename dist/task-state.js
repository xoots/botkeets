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
import fs from 'fs';
import path from 'path';
// ── Anchor sizes by model context ─────────────────────────────────────────────
/** Context window threshold (tokens) above which a model gets the full anchor */
const FULL_ANCHOR_THRESHOLD = 32_000;
const MEDIUM_ANCHOR_THRESHOLD = 8_000;
// ── Core state operations ──────────────────────────────────────────────────────
function statePath(projectId, workspaceDir) {
    return path.join(path.dirname(workspaceDir), 'task_state.json');
}
export function loadTaskState(projectId, workspaceDir) {
    try {
        const raw = fs.readFileSync(statePath(projectId, workspaceDir), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function saveTaskState(state) {
    const p = statePath(state.projectId, state.workspaceDir);
    try {
        state.updatedAt = new Date().toISOString();
        fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
    }
    catch { /* non-fatal */ }
}
export function initTaskState(projectId, workspaceDir, outputDir, taskSummary, subtasks, credentialKeys = []) {
    const now = new Date().toISOString();
    const state = {
        projectId,
        workspaceDir,
        outputDir,
        taskSummary: taskSummary.slice(0, 80),
        credentialKeys,
        steps: subtasks.map((s) => ({
            step: s.step,
            description: s.description,
            tool: s.tool,
            status: 'pending',
            outputs: [],
        })),
        currentStep: 1,
        totalSteps: subtasks.length,
        status: 'executing',
        createdAt: now,
        updatedAt: now,
    };
    saveTaskState(state);
    return state;
}
export function markStepStarted(state, step) {
    const s = state.steps.find((s) => s.step === step);
    if (s) {
        s.status = 'running';
        s.startedAt = new Date().toISOString();
    }
    state.currentStep = step;
    saveTaskState(state);
}
export function markStepDone(state, step, outputs = []) {
    const s = state.steps.find((s) => s.step === step);
    if (s) {
        s.status = 'done';
        s.completedAt = new Date().toISOString();
        s.outputs = outputs;
    }
    // Advance currentStep to next pending
    const next = state.steps.find((s) => s.status === 'pending');
    if (next)
        state.currentStep = next.step;
    else
        state.status = 'complete';
    saveTaskState(state);
}
export function markStepFailed(state, step, error) {
    const s = state.steps.find((s) => s.step === step);
    if (s) {
        s.status = 'failed';
        s.error = error.slice(0, 500);
    }
    state.status = 'failed';
    saveTaskState(state);
}
// ── Anchor generation ──────────────────────────────────────────────────────────
/**
 * Generate a context anchor from task_state.json, sized for the target model's
 * context window. Injected as a user message (not system prompt) before each call.
 *
 * @param state         Current task state
 * @param contextTokens Approximate context window of the target model (tokens)
 */
export function generateAnchor(state, contextTokens) {
    if (contextTokens >= FULL_ANCHOR_THRESHOLD) {
        return generateFullAnchor(state);
    }
    else if (contextTokens >= MEDIUM_ANCHOR_THRESHOLD) {
        return generateMediumAnchor(state);
    }
    else {
        return generateMinimalAnchor(state);
    }
}
/**
 * Full anchor (~500-800 tokens) — for Claude, OpenRouter (200k ctx).
 * Includes complete step history with outputs.
 */
function generateFullAnchor(state) {
    const completed = state.steps.filter((s) => s.status === 'done');
    const failed = state.steps.filter((s) => s.status === 'failed');
    const current = state.steps.find((s) => s.step === state.currentStep);
    const remaining = state.steps.filter((s) => s.status === 'pending');
    const lines = [
        `<system-reminder>`,
        `Task: ${state.taskSummary}`,
        `Workspace: ${state.workspaceDir}`,
        `Output: ${state.outputDir}`,
        `Progress: step ${state.currentStep}/${state.totalSteps}`,
        ``,
    ];
    if (completed.length > 0) {
        lines.push('Completed:');
        for (const s of completed) {
            lines.push(`  ✓ Step ${s.step}: ${s.description}`);
            for (const o of s.outputs.slice(0, 3))
                lines.push(`      → ${o}`);
        }
        lines.push('');
    }
    if (failed.length > 0) {
        lines.push('Failed:');
        for (const s of failed)
            lines.push(`  ✗ Step ${s.step}: ${s.description} — ${s.error ?? 'unknown error'}`);
        lines.push('');
    }
    if (current) {
        lines.push(`Current step ${current.step}: ${current.description} [tool: ${current.tool}]`);
        lines.push('');
    }
    if (remaining.length > 0) {
        lines.push(`Remaining: ${remaining.map((s) => `step ${s.step}`).join(', ')}`);
    }
    if (state.credentialKeys.length > 0) {
        lines.push(`Credentials available: ${state.credentialKeys.join(', ')}`);
    }
    lines.push(`</system-reminder>`);
    return lines.join('\n');
}
/**
 * Medium anchor (~150-250 tokens) — for qwen3:8b (8k-32k ctx).
 * Just current state + next task. No full history.
 */
function generateMediumAnchor(state) {
    const done = state.steps.filter((s) => s.status === 'done').length;
    const current = state.steps.find((s) => s.step === state.currentStep);
    const lastOut = state.steps.find((s) => s.status === 'done')?.outputs?.[0];
    return [
        `<system-reminder>`,
        `Task: ${state.taskSummary}`,
        `Step ${state.currentStep}/${state.totalSteps} (${done} done)`,
        current ? `Now: ${current.description} [${current.tool}]` : '',
        lastOut ? `Last output: ${lastOut.slice(0, 120)}` : '',
        `Workspace: ${state.workspaceDir}`,
        `</system-reminder>`,
    ].filter(Boolean).join('\n');
}
/**
 * Minimal anchor (~50-80 tokens) — for smollm2 and other tiny models.
 * Just enough to not hallucinate context.
 */
function generateMinimalAnchor(state) {
    const current = state.steps.find((s) => s.step === state.currentStep);
    return [
        `<system-reminder>`,
        `Task: ${state.taskSummary.slice(0, 60)}`,
        current ? `Do now: ${current.description}` : '',
        `</system-reminder>`,
    ].filter(Boolean).join('\n');
}
/**
 * Look up approximate context window for a known model.
 * Used to pick the right anchor size.
 */
export function getModelContextTokens(model) {
    const lower = model.toLowerCase();
    if (lower.includes('smollm') || lower.includes('1.7b') || lower.includes('0.5b'))
        return 2_048;
    if (lower.includes('qwen3:8b') || lower.includes('phi4-mini'))
        return 8_000;
    if (lower.includes('qwen3:14b') || lower.includes('qwen3:32b'))
        return 32_000;
    if (lower.includes('claude') || lower.includes('gemini') || lower.includes('gpt-4'))
        return 200_000;
    if (lower.includes('openrouter/auto'))
        return 128_000; // conservative
    return 8_000; // unknown — assume small, get medium anchor
}
//# sourceMappingURL=task-state.js.map