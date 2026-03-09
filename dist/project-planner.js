/**
 * Project Planner
 *
 * Applies the caching lessons from the Claude Code team directly:
 *
 *   1. NEVER swap the toolset to enter plan mode — tools stay identical always.
 *      Instead we inject a <plan_mode> system message into the conversation.
 *      This keeps the cached prefix intact across every planning session.
 *
 *   2. The planning system prompt is STATIC — the same string every call.
 *      It gets cached once and reused on every project. Dynamic context
 *      (task description, vault keys, workspace path) goes in as a MESSAGE,
 *      not in the system prompt.
 *
 *   3. qwen3:8b runs the planning step locally — free, ~300-800ms, zero cloud
 *      tokens. Only the execution phase (if needed) escalates to cloud.
 *
 *   4. AskUserQuestion-style clarification before writing the plan — structured
 *      JSON questions so we always get parseable answers, not free-form text.
 *
 *   5. Plan is written to task.md on disk and injected back as a
 *      <system-reminder> in the execution phase — never touches the system prompt.
 *
 *   6. Subagent handoff format: the plan document doubles as the handoff brief
 *      so the execution agent can start a fresh session with full context and
 *      still get cache hits on its own static prefix.
 *
 * Flow:
 *   receive task → classify → [ask clarifying questions if ambiguous] →
 *   qwen3:8b breaks into subtasks → write task.md → return PlanResult
 */
import fs from 'fs';
import { DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL } from './config.js';
import { logger } from './logger.js';
import { appendProgress } from './project-workspace.js';
import { resolveEffectiveProviderCredential } from './keet-provider-config.js';
import { platformContextManager } from './platform-context-manager.js';
import { runLlm, stripMarkdownCodeFences } from './llm-router.js';
export const PLANNER_DEFAULTS = {
    eco: { provider: 'dashscope', model: 'qwen3.5-plus' },
    standard: { provider: 'deepseek', model: 'deepseek-reasoner' },
    pro: { provider: 'claude', model: 'claude-sonnet-4-6' },
    auto: { provider: 'deepseek', model: 'deepseek-reasoner' },
};
// ── Static cached planning prompt ─────────────────────────────────────────────
// This string is IDENTICAL on every call → gets cached on the first use.
// Dynamic info (task, context, creds) goes in the USER message instead.
const PLANNING_SYSTEM_PROMPT = `You are a task planning agent. Your job is to decompose a user task into concrete, ordered subtasks.

You must respond with ONLY valid JSON matching this schema exactly:
{
  "subtasks": [
    {
      "step": 1,
      "description": "short description of what to do",
      "tool": "bash|browser|search|file|api",
      "dependsOn": [],
      "estimatedMs": 2000,
      "risk_level": "low|medium|high",
      "criticality_tags": ["auth", "migration"]
    }
  ],
  "clarifications": [
    {
      "id": "unique_id",
      "question": "question to ask the user",
      "options": ["option a", "option b", "option c"],
      "required": true
    }
  ],
  "credentialKeys": ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  "needsContainer": true,
  "summary": "one sentence summary of what will be built"
}

Rules:
- Maximum 12 subtasks. Merge small steps.
- credentialKeys: only include if the task genuinely needs them. Empty array if not.
- clarifications: only ask questions that would meaningfully change the plan. 0-3 max.
- needsContainer: true if task requires bash, file writes, or code execution.
- estimatedMs: rough ms per subtask (search=1000, bash=3000, browser=5000, api=2000).
- risk_level: infer operational risk per step.
- criticality_tags: optional short tags (auth, migration, release, external, security).
- Return ONLY the JSON object. No markdown fences. No extra text.`;
async function callPlanner(provider, model, taskDescription, vaultKeys, workspaceDir) {
    // Dynamic context goes in the USER message, not system (cache-safe)
    const userMessage = [
        `Task: ${taskDescription}`,
        vaultKeys.length > 0 ? `Available credentials: ${vaultKeys.join(', ')}` : '',
        `Current date: ${new Date().toISOString().slice(0, 10)}`,
    ].filter(Boolean).join('\n');
    const messages = [
        { role: 'system', content: PLANNING_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
    ];
    try {
        if (provider !== 'ollama' && provider !== 'claude' && !resolveEffectiveProviderCredential(provider, '').api_key) {
            logger.warn({ provider }, 'callPlanner: no api_key for provider — skipping planner');
            return null;
        }
        const raw = (await runLlm({
            messages,
            routes: [{
                    provider: provider,
                    model,
                    timeoutMs: provider === 'ollama' ? 20_000 : provider === 'dashscope' ? 60_000 : 45_000,
                    think: provider === 'ollama' ? false : undefined,
                    temperature: 0.1,
                    numPredict: provider === 'ollama' ? 1500 : undefined,
                    maxTokens: provider === 'ollama' ? undefined : 1500,
                }],
            workspaceDir,
            settingSources: [],
        })).text.trim();
        const parsed = JSON.parse(stripMarkdownCodeFences(raw));
        if (!Array.isArray(parsed.subtasks))
            return null;
        return parsed;
    }
    catch (err) {
        logger.warn({ err, provider }, 'Planner call failed');
        return null;
    }
}
// ── Plan markdown renderer ─────────────────────────────────────────────────────
function renderPlanMarkdown(task, plan, workspace) {
    const lines = [
        `# Task Plan`,
        ``,
        `**Task:** ${task}`,
        `**Created:** ${new Date().toISOString()}`,
        `**Workspace:** ${workspace.workspaceDir}`,
        ``,
    ];
    if (plan.summary) {
        lines.push(`## Summary`, ``, plan.summary, ``);
    }
    if (plan.credentialKeys.length > 0) {
        lines.push(`## Required Credentials`, ``, `Place these in \`vault.env\` before execution:`, ...plan.credentialKeys.map((k) => `- \`${k}\``), ``);
    }
    if (plan.clarifications.length > 0) {
        lines.push(`## Clarifications Needed`, ``, ...plan.clarifications.map((q) => `- **${q.id}:** ${q.question}\n  Options: ${q.options.join(' | ')}`), ``);
    }
    lines.push(`## Subtasks`, ``);
    for (const s of plan.subtasks) {
        const deps = s.dependsOn.length > 0 ? ` *(after ${s.dependsOn.map((d) => `step ${d}`).join(', ')})*` : '';
        lines.push(`${s.step}. **[${s.tool}]** ${s.description}${deps}`);
    }
    lines.push(``, `## Status`, ``, `- [ ] Plan approved`, `- [ ] Execution started`, `- [ ] Complete`);
    return lines.join('\n');
}
// ── Plan verification (openrouter/auto) ───────────────────────────────────────
// qwen3:8b is good at decomposition but can hallucinate tool availability and
// misorder dependencies. A cheap cloud pass (~$0.001-0.003) catches bad plans
// before an expensive container run. Uses openrouter/auto so NotDiamond picks
// the cheapest capable model (Flash, Haiku, etc.) — no hardcoding needed.
//
// This is a SEPARATE call from the execution session, so it can't break that
// session's cache prefix.
const VERIFY_SYSTEM_PROMPT = `You are a plan verifier. Review the task plan JSON and respond with ONLY valid JSON:
{
  "verdict": "ok" | "issues",
  "issues": ["issue1", "issue2"],    // empty array if verdict is "ok"
  "suggestions": ["fix1", "fix2"]    // concrete fixes for each issue
}

Check for: unreachable steps (dependency loops), missing credential declarations,
tool mismatches (e.g. using 'file' when 'bash' is needed), missing error-handling steps
for network or API tasks, and plans that obviously can't succeed as written.
Be lenient — only flag real problems, not stylistic preferences. Return ONLY the JSON.`;
async function verifyPlan(plan, taskDescription) {
    const dashscope = resolveEffectiveProviderCredential('dashscope', DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL);
    if (!dashscope.api_key)
        return null; // skip if no key
    const userMessage = `Task: ${taskDescription}\n\nPlan:\n${JSON.stringify(plan, null, 2)}`;
    try {
        const raw = (await runLlm({
            messages: [
                { role: 'system', content: VERIFY_SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            routes: [{
                    provider: 'dashscope',
                    model: 'qwen-plus',
                    timeoutMs: 60_000,
                    maxTokens: 400,
                    temperature: 0,
                }],
        })).text.trim();
        return JSON.parse(stripMarkdownCodeFences(raw));
    }
    catch (err) {
        logger.debug({ err }, 'Plan verification failed — proceeding unverified');
        return null;
    }
}
// ── Fallback rule-based planner ────────────────────────────────────────────────
// Used when Ollama is unavailable — produces a basic 3-step plan.
function ruleBasedPlan(task) {
    return {
        subtasks: [
            { step: 1, description: 'Research and gather requirements', tool: 'search', dependsOn: [], estimatedMs: 2000, risk_level: 'low', criticality_tags: ['external'] },
            { step: 2, description: 'Implement the solution', tool: 'bash', dependsOn: [1], estimatedMs: 10000, risk_level: 'medium', criticality_tags: ['external'] },
            { step: 3, description: 'Test and deliver output', tool: 'bash', dependsOn: [2], estimatedMs: 3000, risk_level: 'medium', criticality_tags: [] },
        ],
        clarifications: [],
        credentialKeys: [],
        needsContainer: true,
        summary: `Complete: ${task.slice(0, 80)}`,
    };
}
function autoAnswerClarifications(clarifications, taskDescription) {
    const answers = {};
    for (const q of clarifications) {
        if (!q.required) {
            // Skip optional questions entirely
            continue;
        }
        // Pick first option as safe default, log it
        const defaultAnswer = q.options[0] ?? 'proceed with defaults';
        logger.info({ id: q.id, question: q.question, autoAnswer: defaultAnswer }, 'Auto-answering clarifying question — no human response available');
        answers[q.id] = defaultAnswer;
    }
    return answers;
}
export function flagNeedsDecomposition(subtasks) {
    const toolTypes = new Set(subtasks.map(s => s.tool));
    return toolTypes.size >= 2;
}
// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Enter project plan mode for a task.
 *
 * This is cache-safe: it uses a static system prompt, injects dynamic context
 * as a user message, and writes the plan to task.md (not the system prompt).
 * The returned PlanResult includes clarifying questions to surface to the user
 * before execution begins, following the AskUserQuestion pattern.
 *
 * @param taskDescription  The raw task prompt from the user
 * @param vaultKeys        Keys already present in vault.env (if any)
 * @param plannerProvider  Override provider (defaults to PLANNER_DEFAULTS['standard'].provider)
 * @param plannerModel     Override model (defaults to PLANNER_DEFAULTS['standard'].model)
 */
export async function enterProjectPlanMode(taskDescription, vaultKeys = [], plannerProvider, plannerModel) {
    logger.info({ task: taskDescription.slice(0, 80) }, 'Entering project plan mode');
    // 1. Lease workspace from platform context manager.
    const workspaceHandle = platformContextManager.leaseWorkspaceContext({
        namespace: 'keet',
        taskDescription,
        limits: {
            maxSubtasks: 12,
            maxClarifications: 3,
        },
    });
    const workspace = workspaceHandle.workspace;
    appendProgress(workspace, 'Plan mode started');
    // 2. Run planner — resolve provider/model from PLANNER_DEFAULTS, then call
    const provider = plannerProvider ?? PLANNER_DEFAULTS['standard'].provider;
    const model = plannerModel ?? PLANNER_DEFAULTS['standard'].model;
    let rawPlan = await callPlanner(provider, model, taskDescription, vaultKeys, workspace.workspaceDir);
    const usedFallback = !rawPlan;
    rawPlan ??= ruleBasedPlan(taskDescription);
    if (usedFallback) {
        appendProgress(workspace, 'Planner used rule-based fallback (Ollama unavailable)');
    }
    else {
        appendProgress(workspace, `qwen3:8b plan: ${rawPlan.subtasks.length} subtasks`);
    }
    // 3. Verify plan via DashScope direct — catch bad plans before container spin-up
    //    Cost: ~$0.001-0.003. Skip silently if DashScope key not configured.
    const verification = await verifyPlan(rawPlan, taskDescription);
    if (verification) {
        if (verification.verdict === 'issues' && verification.issues.length > 0) {
            logger.warn({ issues: verification.issues }, 'Plan verification flagged issues');
            appendProgress(workspace, `Verification issues: ${verification.issues.join('; ')}`);
            // Append verification notes to the plan — visible to user and execution agent
            rawPlan = {
                ...rawPlan,
                summary: `${rawPlan.summary}\n\n⚠️ Verifier notes:\n${verification.issues.map((i) => `• ${i}`).join('\n')}${verification.suggestions.length ? '\n\nSuggestions:\n' + verification.suggestions.map((s) => `• ${s}`).join('\n') : ''}`,
            };
        }
        else {
            appendProgress(workspace, 'Plan verified ✓');
        }
    }
    // 4. Render and save plan to task.md
    const planMarkdown = renderPlanMarkdown(taskDescription, rawPlan, workspace);
    fs.writeFileSync(workspace.taskFile, planMarkdown, 'utf-8');
    appendProgress(workspace, `Plan written: ${rawPlan.subtasks.length} subtasks`);
    logger.info({ workspace: workspace.id, subtasks: rawPlan.subtasks.length, clarifications: rawPlan.clarifications.length }, 'Project plan complete');
    const autoAnswers = autoAnswerClarifications(rawPlan.clarifications, taskDescription);
    const hasAutoAnswers = Object.keys(autoAnswers).length > 0;
    if (hasAutoAnswers) {
        appendProgress(workspace, `Auto-answered ${Object.keys(autoAnswers).length} clarifying question(s) — proceeding without human input`);
    }
    return {
        workspace,
        workspaceHandle,
        subtasks: rawPlan.subtasks,
        clarifications: rawPlan.clarifications,
        planMarkdown,
        needsContainer: rawPlan.needsContainer,
        credentialKeys: rawPlan.credentialKeys,
        autoAnswers,
        needs_decomposition: flagNeedsDecomposition(rawPlan.subtasks),
    };
}
/**
 * Build the handoff message for the execution subagent.
 *
 * This message is injected as a <system-reminder> at the start of the
 * execution session — keeping the execution agent's system prompt static
 * (cache-safe) while giving it full plan context.
 */
export function buildHandoffMessage(plan, clarificationAnswers = plan.autoAnswers ?? {}) {
    const answers = Object.entries(clarificationAnswers)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n');
    return [
        `<system-reminder>`,
        `You are executing a planned task. Follow the plan exactly.`,
        ``,
        `Workspace: ${plan.workspace.workspaceDir}`,
        `Output dir: ${plan.workspace.outputDir}`,
        ``,
        `## Plan`,
        plan.planMarkdown,
        answers ? `\n## User Clarifications\n${answers}` : '',
        `</system-reminder>`,
    ].filter((l) => l !== undefined).join('\n');
}
//# sourceMappingURL=project-planner.js.map