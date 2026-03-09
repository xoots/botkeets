/**
 * Task Runner
 *
 * Executes a project plan in one of two modes, with automatic mode switching:
 *
 * ── STRUCTURED MODE (default, token-efficient) ────────────────────────────────
 * Walks PlanResult.subtasks in dependency order. Each step dispatched to the
 * right handler with a focused anchor-injected prompt. Token-efficient because
 * each call only needs: static system prompt + anchor (50-800 tokens) + one step.
 * The model can't wander — it knows exactly what to do.
 *
 * Tool dispatch:
 *   search  → web-search.ts (local, no container)
 *   fetch   → web-fetch.ts  (local, no container)
 *   bash / file / browser / api → containerExecute() with focused step prompt
 *
 * ── AUTONOMOUS MODE (adaptive, nanobot-style) ─────────────────────────────────
 * Hands all remaining steps to the container with full plan context. The model
 * iterates, discovers, and adapts. Used when:
 *   • A step fails twice (automatic escape hatch — no user action needed)
 *   • task_type is 'research' or 'complex' and verification flagged issues
 *   • User sends !auto override
 *
 * ── AUTOMATIC ESCAPE HATCH ────────────────────────────────────────────────────
 * Structured step failure: retry once → retry twice → flip to autonomous.
 * The flip is silent — user just sees progress continue. task_state.json records
 * the mode switch so the self-improvement loop can learn which task types
 * reliably succeed in structured mode vs needing autonomous.
 *
 * ── CACHE SAFETY ──────────────────────────────────────────────────────────────
 * Following the Claude Code caching article:
 *   • System prompt is STATIC — never changes between steps
 *   • Step context injected as user messages (not system prompt mutations)
 *   • Anchor injected as <system-reminder> tag in user turn
 *   • Mode switch doesn't change tools — autonomous uses same toolset
 *
 * ── DECOUPLED CONTAINER INTERFACE ────────────────────────────────────────────
 * task-runner doesn't import container-runner directly (avoids circular deps).
 * Instead accepts a `containerExecute` callback — the caller (container-runner)
 * passes its own execution function in. Clean inversion of control.
 */
import { initTaskState, markStepStarted, markStepDone, markStepFailed, generateAnchor, } from './task-state.js';
import { ProgressReporter } from './progress-reporter.js';
import { webSearch, formatSearchResults } from './web-search.js';
import { fetchPage, formatFetchedPage } from './web-fetch.js';
import { logger, childLogger } from './logger.js';
import { logRoutingDecision } from './routing-logger.js';
import { KEET_MCP_API_STEPS_ENABLED, MAX_RECURSIVE_SHARD_SPLITS, MAX_TASK_CALLS } from './config.js';
import { decideStepRouting } from './step-router.js';
import { logStepRoutingDecision } from './step-routing-logger.js';
import { getOrInitTaskSpend, } from './budget-policy.js';
import { executeKeetMcpApiStep, getKeetMcpAdapterState } from './copaw-system.js';
import { getKeetProviderCapability, resolvePrimaryProviderForMode, validateKeetExecutionReadiness } from './keet-provider-config.js';
import { updateTask } from './task-registry.js';
import { platformAuthorityService } from './app-infra/authority/platform-authority-service.js';
import { buildExecutionOrder } from './reasoning/per-step-planning.js';
import { applyShardOutcome, initialShard } from './reasoning/sharding.js';
import { selectPerShardContextTokens } from './reasoning/anchor-context.js';
import { selectConstrainedStepAction } from './reasoning/action-selection.js';
import { dispatchKeetTask } from './trigger/tasks.js';
import { parseMVPSubagentOutput, resolveModelTierFromAgentType } from './memory-subagent-contract.js';
// ── Static system prompts (cached — never mutated between steps) ──────────────
const STRUCTURED_STEP_SYSTEM = `You are an autonomous agent executing a single step of a project plan.
Execute ONLY the step described. Do not skip ahead or do extra work.
When done, output a brief summary of what you did and any key outputs (file paths, results, etc.).
If you cannot complete the step, output: STEP_FAILED: <reason>`;
const AUTONOMOUS_SYSTEM = `You are an autonomous agent. Execute the project plan completely.
Work through each step systematically. Use available tools as needed.
Report progress as you go. When complete, summarise all outputs.`;
function buildInjectedContext(injectedAnchorContext) {
    if (!injectedAnchorContext)
        return '';
    return [injectedAnchorContext.anchorContent, injectedAnchorContext.userContext].filter(Boolean).join('\n\n');
}
// ── Tool handlers ──────────────────────────────────────────────────────────────
async function handleSearchStep(step, state, model) {
    try {
        const usePro = false; // search steps always use Brave (budget-conscious)
        const result = await webSearch(step.description, usePro);
        const output = formatSearchResults(result);
        return { output: (output || result.warning || '').slice(0, 2000), success: true };
    }
    catch (err) {
        return { output: `Search failed: ${err instanceof Error ? err.message : String(err)}`, success: false };
    }
}
async function handleFetchStep(step) {
    // Extract URL from step description if present
    const urlMatch = step.description.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) {
        return { output: `No URL found in step description: "${step.description}"`, success: false };
    }
    try {
        const page = await fetchPage(urlMatch[0]);
        return { output: formatFetchedPage(page).slice(0, 3000), success: true };
    }
    catch (err) {
        return { output: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`, success: false };
    }
}
function buildStepPrompt(step, state, modelContextTokens, injectedAnchorContext, shard, mcpContext) {
    const anchor = generateAnchor(state, modelContextTokens);
    const injectedContext = buildInjectedContext(injectedAnchorContext);
    const actionText = shard?.text ?? step.description;
    const shardLabel = shard ? `\n**Shard:** ${shard.index}/${shard.total} (id=${shard.id}, depth=${shard.depth})` : '';
    return [
        injectedContext,
        injectedContext ? '' : undefined,
        anchor,
        '',
        `## Your task: Step ${step.step} of ${state.totalSteps}`,
        `**Action:** ${actionText}${shardLabel}`,
        `**Tool:** ${step.tool}`,
        `**Workspace:** ${state.workspaceDir}`,
        `**Output dir:** ${state.outputDir}`,
        mcpContext ? `**MCP context:**\n${mcpContext}` : '',
        '',
        'Execute this step now. Output a brief summary when done.',
        'If you cannot complete it, start your response with: STEP_FAILED:',
    ].filter((part) => typeof part === 'string').join('\n');
}
async function executeContainerStepWithSharding(subtask, state, modelCtx, containerExecute, chatJid, vaultEnv, baseDecision, sessionId, injectedAnchorContext, mcpContext) {
    const queue = [initialShard(subtask.step, subtask.description)];
    const outputs = [];
    while (queue.length > 0) {
        const shard = queue.shift();
        const perShardCtx = selectPerShardContextTokens(modelCtx, shard.depth);
        const prompt = buildStepPrompt(subtask, state, perShardCtx, injectedAnchorContext, shard, mcpContext);
        const shardDecision = {
            ...baseDecision,
            shard_id: shard.id,
        };
        const raw = await containerExecute(prompt, chatJid, vaultEnv, shardDecision, sessionId);
        const plan = applyShardOutcome({
            queue,
            shard,
            rawOutput: raw,
            maxRecursiveSplits: MAX_RECURSIVE_SHARD_SPLITS,
        });
        if (plan.terminalError) {
            return { success: false, output: plan.terminalError };
        }
        if (plan.completedOutput) {
            outputs.push(plan.completedOutput.slice(0, 600));
        }
        queue.splice(0, queue.length, ...plan.nextQueue);
    }
    return { success: true, output: outputs.join('\n') };
}
function buildAutonomousPrompt(state, planMarkdown, completedSummary, modelContextTokens, clarificationAnswers = {}, injectedAnchorContext) {
    const anchor = generateAnchor(state, modelContextTokens);
    const injectedContext = buildInjectedContext(injectedAnchorContext);
    const answersSection = Object.keys(clarificationAnswers).length > 0
        ? `\n## User clarifications\n${Object.entries(clarificationAnswers).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
        : '';
    return [
        injectedContext,
        injectedContext ? '' : undefined,
        anchor,
        '',
        '## Full project plan',
        planMarkdown,
        answersSection,
        completedSummary ? `\n## Already completed\n${completedSummary}` : '',
        '',
        `Execute all remaining steps. Workspace: ${state.workspaceDir}`,
    ].filter((part) => typeof part === 'string' && part.length > 0).join('\n');
}
// ── Structured mode executor ───────────────────────────────────────────────────
async function runStructured(plan, state, reporter, containerExecute, chatJid, opts, mcpContext, mcpExecutedSteps = []) {
    const log = opts.traceId ? childLogger(opts.traceId) : logger;
    const outputs = [];
    const modelCtx = opts.modelContextTokens;
    // Build execution order respecting dependencies
    const ordered = buildExecutionOrder(state.steps.map((s) => ({
        step: s.step,
        description: s.description,
        tool: s.tool,
        dependsOn: plan.subtasks.find((p) => p.step === s.step)?.dependsOn ?? [],
        estimatedMs: plan.subtasks.find((p) => p.step === s.step)?.estimatedMs ?? 3000,
    })));
    for (const subtask of ordered) {
        const stepNum = subtask.step;
        let retries = 0;
        let stepDone = false;
        while (!stepDone && retries <= opts.maxStepRetries) {
            const attempt = retries + 1;
            const isRetry = retries > 0;
            markStepStarted(state, stepNum);
            await reporter.update(`Step ${stepNum}/${state.totalSteps}: ${subtask.description}${isRetry ? ` (retry ${retries})` : ''}`);
            const stepStart = Date.now();
            let output = '';
            let success = false;
            const stepDecision = decideStepRouting(subtask, opts.routingContext, retries);
            logStepRoutingDecision(stepDecision);
            try {
                // ── Local tool handlers (no container) ───────────────────────────────
                if (subtask.tool === 'search') {
                    const result = await handleSearchStep(subtask, state, 'brave');
                    output = result.output;
                    success = result.success;
                }
                else if (subtask.tool === 'fetch') {
                    const result = await handleFetchStep(subtask);
                    output = result.output;
                    success = result.success;
                }
                else if (subtask.tool === 'api' && KEET_MCP_API_STEPS_ENABLED) {
                    const mcpResult = await executeKeetMcpApiStep(subtask.description);
                    if (mcpResult.handled) {
                        output = `[mcp:${mcpResult.client_key || 'unknown'}] ${mcpResult.output}`;
                        success = mcpResult.success;
                        mcpExecutedSteps.push(`step ${subtask.step}: ${mcpResult.client_key || 'unknown'} (${mcpResult.success ? 'ok' : 'failed'})`);
                    }
                    else {
                        const shardResult = await executeContainerStepWithSharding(subtask, state, modelCtx, containerExecute, chatJid, opts.vaultEnv, stepDecision, opts.sessionId, opts.injectedAnchorContext, mcpContext);
                        output = shardResult.output;
                        success = shardResult.success;
                    }
                }
                else {
                    // ── Container dispatch (bash / file / browser / api) ──────────────
                    const shardResult = await executeContainerStepWithSharding(subtask, state, modelCtx, containerExecute, chatJid, opts.vaultEnv, stepDecision, opts.sessionId, opts.injectedAnchorContext, mcpContext);
                    output = shardResult.output;
                    success = shardResult.success;
                }
            }
            catch (err) {
                output = `Step threw: ${err instanceof Error ? err.message : String(err)}`;
                success = false;
            }
            const latencyMs = Date.now() - stepStart;
            // Log to self-improvement JSONL
            logRoutingDecision({
                chatJid,
                intent: subtask.tool,
                mode: opts.routingContext.effective_mode,
                modeOverride: opts.routingContext.source === 'inline_override',
                provider: stepDecision.provider,
                model: stepDecision.model,
                inputTokens: 0,
                outputTokens: 0,
                usdCost: 0,
                latencyMs,
                success,
                fallback: stepDecision.is_escalated,
                note: `step ${stepNum}: ${subtask.description.slice(0, 60)} · risk=${stepDecision.risk_level}`,
            });
            if (success) {
                markStepDone(state, stepNum, [output.slice(0, 500)]);
                outputs.push(`Step ${stepNum}: ${output.slice(0, 300)}`);
                stepDone = true;
            }
            else {
                retries++;
                markStepFailed(state, stepNum, output);
                log.warn({ stepNum, attempt, output: output.slice(0, 200) }, 'Step failed');
                const action = selectConstrainedStepAction({
                    success: false,
                    attempt: retries,
                    maxRetries: opts.maxStepRetries,
                    escalationAvailable: stepDecision.escalation_target !== null,
                    alreadyEscalated: stepDecision.is_escalated,
                    hardStopExceeded: output.trim().startsWith('STEP_FAILED: CONTEXT_HARD_STOP_EXCEEDED'),
                    shardSplitAvailable: false,
                    shardDepth: 0,
                    maxShardDepth: 0,
                });
                if (action === 'trigger_escape_hatch' || action === 'fail') {
                    log.warn({ stepNum }, '🔄 Escape hatch triggered — switching to autonomous mode');
                    await reporter.update(`⚠️ Step ${stepNum} failed after ${opts.maxStepRetries + 1} attempts — switching to full autonomous mode`);
                    return { success: false, escapeHatch: true, outputs };
                }
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    }
    return { success: true, escapeHatch: false, outputs };
}
// ── Autonomous mode executor ───────────────────────────────────────────────────
async function runAutonomous(plan, state, reporter, containerExecute, chatJid, opts, completedOutputs = [], mcpContext) {
    const log = opts.traceId ? childLogger(opts.traceId) : logger;
    await reporter.update('🤖 Autonomous mode — executing full plan');
    const completedSummary = completedOutputs.length > 0
        ? completedOutputs.join('\n')
        : '';
    const prompt = buildAutonomousPrompt(state, plan.planMarkdown, completedSummary, opts.modelContextTokens, opts.clarificationAnswers, opts.injectedAnchorContext) + (mcpContext ? `\n\n## MCP adapter context\n${mcpContext}` : '');
    const start = Date.now();
    let output = '';
    let success = false;
    try {
        const autonomousDecision = decideStepRouting({
            step: 0,
            description: 'Autonomous execution',
            tool: 'bash',
            dependsOn: [],
            estimatedMs: 10_000,
            risk_level: 'high',
            criticality_tags: ['autonomous'],
        }, opts.routingContext, 0);
        logStepRoutingDecision(autonomousDecision);
        output = await containerExecute(prompt, chatJid, opts.vaultEnv, autonomousDecision, opts.sessionId);
        const subagentReturn = parseMVPSubagentOutput(output);
        if (subagentReturn) {
            log.debug({ agentType: subagentReturn.agent_type, confidence: subagentReturn.confidence, tokensUsed: subagentReturn.tokens_used }, 'task-runner: valid MVPSubagentReturn received');
            // Replace raw output with structured summary for orchestrator context
            // Only replace if subagent return is confident (>= 0.5)
            if (subagentReturn.confidence >= 0.5) {
                const suggestedTier = resolveModelTierFromAgentType(subagentReturn.agent_type);
                log.debug({ suggestedTier }, 'task-runner: subagent tier hint for next step');
                output = `${subagentReturn.summary}\n\nKey findings:\n${subagentReturn.key_findings.map(f => `- ${f}`).join('\n')}`;
            }
        }
        success = output.length > 0
            && !output.toLowerCase().startsWith('error:')
            && !output.startsWith('STEP_FAILED:');
    }
    catch (err) {
        output = err instanceof Error ? err.message : String(err);
        success = false;
    }
    logRoutingDecision({
        chatJid,
        intent: 'complex',
        mode: opts.routingContext.effective_mode,
        modeOverride: opts.routingContext.source === 'inline_override',
        provider: opts.routingContext.effective_mode === 'pro' ? 'claude' : 'openrouter',
        model: opts.routingContext.effective_mode === 'pro' ? 'autonomous-pro' : 'autonomous-hybrid',
        inputTokens: 0,
        outputTokens: 0,
        usdCost: 0,
        latencyMs: Date.now() - start,
        success,
        fallback: completedOutputs.length > 0, // true = we got here via escape hatch
        note: `autonomous: ${plan.workspace.id}`,
    });
    return { success, outputs: [output.slice(0, 1000)] };
}
// ── Public entry point ─────────────────────────────────────────────────────────
/**
 * Execute a project plan.
 *
 * Starts in STRUCTURED mode by default. If a step fails maxStepRetries times,
 * the escape hatch fires automatically and the runner switches to AUTONOMOUS.
 * No user action required — the switch is silent and logged.
 *
 * @param plan             PlanResult from enterProjectPlanMode()
 * @param channel          Active chat channel (Telegram or Discord)
 * @param chatJid          Chat identifier
 * @param containerExecute Callback that runs a prompt in the container
 * @param vaultEnv         Decoded vault credentials (keys/values)
 * @param opts             Runner options (mode override, retry limits, etc.)
 */
export async function runTask(plan, channel, chatJid, containerExecute, vaultEnv = {}, opts = {}) {
    const fullOpts = {
        mode: opts.mode ?? 'structured',
        maxStepRetries: opts.maxStepRetries ?? 2,
        maxAutonomousIter: opts.maxAutonomousIter ?? 20,
        modelContextTokens: opts.modelContextTokens ?? 32_000,
        originalMsgId: opts.originalMsgId ?? '',
        clarificationAnswers: opts.clarificationAnswers ?? {},
        maxCalls: opts.maxCalls ?? MAX_TASK_CALLS,
        vaultEnv: vaultEnv,
        sessionId: opts.sessionId ?? '',
        workspaceLeaseId: opts.workspaceLeaseId ?? '',
        workspaceNamespace: opts.workspaceNamespace ?? '',
        memoryContext: opts.memoryContext,
        routingContext: opts.routingContext ?? {
            requested_mode: null,
            effective_mode: 'standard',
            source: 'chat_default',
            inline_override: null,
            clean_content: '',
        },
        injectedAnchorContext: opts.injectedAnchorContext ?? {
            anchorContent: '',
            userContext: '',
        },
        traceId: opts.traceId ?? '',
    };
    const log = fullOpts.traceId ? childLogger(fullOpts.traceId) : logger;
    const effectiveMode = fullOpts.routingContext.effective_mode;
    const taskSpend = getOrInitTaskSpend(plan.workspace.id, effectiveMode);
    const mcpAdapter = await getKeetMcpAdapterState();
    const primaryProvider = resolvePrimaryProviderForMode(effectiveMode);
    const mcpContext = mcpAdapter.enabled_clients.length
        ? `Enabled KEET MCP clients:\n${mcpAdapter.enabled_clients
            .map((client) => `- ${client.key} (${client.transport}) — ${client.health ?? 'unknown'}`)
            .join('\n')}`
        : '';
    const reporter = new ProgressReporter(channel, chatJid, fullOpts.originalMsgId || null);
    await reporter.start(`📋 Executing: ${plan.workspace.id} (${plan.subtasks.length} steps, ${fullOpts.mode} mode)`);
    const executionActor = { id: 'keet-runtime', role: 'keet-agent' };
    const startDecision = platformAuthorityService.authorizeTaskStart(executionActor, {
        taskId: plan.workspace.id,
        mode: effectiveMode,
        proposedShardCount: plan.subtasks.length,
        requestedMaxCalls: fullOpts.maxCalls,
    });
    fullOpts.maxCalls = startDecision.enforcedMaxCalls;
    if (!startDecision.allowed && startDecision.reason === 'awaiting_pro_shard_approval') {
        await reporter.error('⏸ Pro shard plan requires manual approval. Use POST /api/tasks/:id/pro-shard/approve then rerun.');
        return {
            success: false,
            mode: fullOpts.mode,
            finalMode: fullOpts.mode,
            stepsCompleted: 0,
            stepsFailed: 0,
            escapeHatchTriggered: false,
            outputs: [],
            budget_blocked_reason: 'awaiting_pro_shard_approval',
            spend_summary: {
                task_spent_usd: taskSpend.spent,
                call_count: taskSpend.calls,
                mode: effectiveMode,
            },
            escalation_spend: taskSpend.escalationSpent,
        };
    }
    if (!startDecision.allowed && startDecision.reason === 'pro_shard_limit_exceeded') {
        await reporter.error('⛔ Task blocked: pro shard guardrail exceeded.');
        return {
            success: false,
            mode: fullOpts.mode,
            finalMode: fullOpts.mode,
            stepsCompleted: 0,
            stepsFailed: 0,
            escapeHatchTriggered: false,
            outputs: [],
            budget_blocked_reason: 'blocked_budget_task',
            spend_summary: {
                task_spent_usd: taskSpend.spent,
                call_count: taskSpend.calls,
                mode: effectiveMode,
            },
            escalation_spend: taskSpend.escalationSpent,
        };
    }
    if (!startDecision.allowed) {
        await reporter.error(`⛔ Execution denied by app infra authority: ${startDecision.reason}`);
        return {
            success: false,
            mode: fullOpts.mode,
            finalMode: fullOpts.mode,
            stepsCompleted: 0,
            stepsFailed: 0,
            escapeHatchTriggered: false,
            outputs: [`Execution denied by app infra authority: ${startDecision.reason}`],
            spend_summary: {
                task_spent_usd: taskSpend.spent,
                call_count: taskSpend.calls,
                mode: effectiveMode,
            },
            escalation_spend: taskSpend.escalationSpent,
        };
    }
    const executionReadiness = validateKeetExecutionReadiness(effectiveMode);
    updateTask(plan.workspace.id, {
        preflightOk: executionReadiness.ok,
        preflightErrors: executionReadiness.errors,
        preflightWarnings: [...executionReadiness.warnings, ...mcpAdapter.warnings],
        providerCompatibility: {
            provider_id: primaryProvider.provider_id,
            model: primaryProvider.model,
            compatible_with_keet: getKeetProviderCapability(primaryProvider.provider_id).compatible_with_keet,
        },
        mcpSummary: {
            enabled: mcpAdapter.enabled_clients.filter(c => c.enabled).length,
            healthy: mcpAdapter.enabled_clients.filter(c => c.enabled && c.health !== 'degraded').length,
            degraded: mcpAdapter.enabled_clients.filter(c => c.health === 'degraded').length,
        },
    });
    if (!executionReadiness.ok) {
        const message = `⛔ Execution blocked by KEET readiness: ${executionReadiness.errors.join('; ')}`;
        await reporter.error(message);
        return {
            success: false,
            mode: fullOpts.mode,
            finalMode: fullOpts.mode,
            stepsCompleted: 0,
            stepsFailed: 0,
            escapeHatchTriggered: false,
            outputs: [message, ...executionReadiness.warnings.map((warning) => `warning: ${warning}`)],
            spend_summary: {
                task_spent_usd: taskSpend.spent,
                call_count: taskSpend.calls,
                mode: effectiveMode,
            },
            escalation_spend: taskSpend.escalationSpent,
        };
    }
    const asyncRuntime = (process.env.KEET_ASYNC_RUNTIME || '').trim().toLowerCase();
    if (asyncRuntime === 'trigger') {
        const mode = effectiveMode;
        const payload = {
            taskId: plan.workspace.id,
            mode,
            chatJid,
            planMarkdown: plan.planMarkdown,
            subtasks: plan.subtasks.map((step) => ({
                step: step.step,
                description: step.description,
                tool: step.tool,
            })),
            metadata: {
                sessionId: fullOpts.sessionId || null,
                workspaceDir: plan.workspace.workspaceDir,
                outputDir: plan.workspace.outputDir,
            },
        };
        try {
            const triggerRun = await dispatchKeetTask(mode, payload);
            const runLabel = triggerRun.runId ? `run_id=${triggerRun.runId}` : 'run accepted (no id returned)';
            await reporter.finish(`✅ Trigger accepted task dispatch: ${runLabel}`);
            return {
                success: true,
                mode: fullOpts.mode,
                finalMode: fullOpts.mode,
                stepsCompleted: 0,
                stepsFailed: 0,
                escapeHatchTriggered: false,
                outputs: [`trigger_dispatch: ${runLabel}`],
                spend_summary: {
                    task_spent_usd: taskSpend.spent,
                    call_count: taskSpend.calls,
                    mode: effectiveMode,
                },
                escalation_spend: taskSpend.escalationSpent,
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error({ err: message, workspace: plan.workspace.id }, 'Trigger dispatch failed, falling back to local runner');
            await reporter.update(`⚠️ Trigger dispatch failed (${message}). Falling back to local execution.`);
        }
    }
    // ── Call budget shim ────────────────────────────────────────────────────
    // Wraps containerExecute to count invocations and hard-stop on budget exhaustion.
    let callCount = 0;
    const budgetedExecute = async (prompt, chatJid, vaultEnv, stepRoutingDecision, sessionId) => {
        callCount++;
        const shardId = stepRoutingDecision?.shard_id ?? `step-${stepRoutingDecision?.step ?? callCount}`;
        const provider = stepRoutingDecision?.provider ?? (effectiveMode === 'pro' ? 'claude' : 'openrouter');
        const isEscalated = Boolean(stepRoutingDecision?.is_escalated);
        const authDecision = platformAuthorityService.authorizeCanExecute(executionActor, {
            taskId: plan.workspace.id,
            mode: effectiveMode,
            shardId,
            provider,
            isEscalated,
            proposedCallCount: callCount,
            enforcedMaxCalls: fullOpts.maxCalls,
        });
        if (!authDecision.allowed) {
            if (authDecision.reason === 'max_calls_exceeded') {
                throw new Error(`BUDGET_EXCEEDED: task reached the ${fullOpts.maxCalls}-call limit. ` +
                    'Increase MAX_TASK_CALLS or split the task into smaller pieces.');
            }
            if (authDecision.reason === 'awaiting_pro_shard_approval' || authDecision.reason.startsWith('blocked_budget_')) {
                throw new Error(`BUDGET_BLOCKED:${authDecision.reason}`);
            }
            throw new Error(`INFRA_DENIED:${authDecision.reason}`);
        }
        log.debug({ callCount, maxCalls: fullOpts.maxCalls, provider, shardId }, 'container call');
        try {
            return await containerExecute(prompt, chatJid, vaultEnv, stepRoutingDecision, sessionId);
        }
        finally {
            platformAuthorityService.recordApprovedSpend({
                taskId: plan.workspace.id,
                mode: effectiveMode,
                shardId,
                provider,
                isEscalated,
            });
        }
    };
    // Initialise task_state.json
    const state = initTaskState(plan.workspace.id, plan.workspace.workspaceDir, plan.workspace.outputDir, plan.planMarkdown.split('\n').find((l) => l.startsWith('**Task:**'))?.replace('**Task:**', '').trim() ?? plan.workspace.id, plan.subtasks, plan.credentialKeys);
    let startingMode = fullOpts.mode;
    let finalMode = startingMode;
    let escapeHatch = false;
    let stepsCompleted = 0;
    let stepsFailed = 0;
    let allOutputs = [];
    const mcpExecutedSteps = [];
    let success = false;
    let budgetBlockedReason;
    try {
        if (startingMode === 'structured') {
            const effectiveMcpContext = mcpContext && ['api', 'browser', 'bash', 'file'].some((tool) => plan.subtasks.some((step) => step.tool === tool))
                ? mcpContext
                : undefined;
            const result = await runStructured(plan, state, reporter, budgetedExecute, chatJid, fullOpts, effectiveMcpContext, mcpExecutedSteps);
            allOutputs = result.outputs;
            stepsCompleted = state.steps.filter((s) => s.status === 'done').length;
            stepsFailed = state.steps.filter((s) => s.status === 'failed').length;
            if (result.escapeHatch) {
                // ── Automatic escape hatch ────────────────────────────────────────────
                escapeHatch = true;
                finalMode = 'autonomous';
                log.info({ workspace: plan.workspace.id }, 'Escape hatch: switching to autonomous');
                const autoResult = await runAutonomous(plan, state, reporter, budgetedExecute, chatJid, fullOpts, result.outputs, mcpContext || undefined);
                success = autoResult.success;
                allOutputs = [...allOutputs, ...autoResult.outputs];
            }
            else {
                success = result.success;
            }
        }
        else {
            // User explicitly chose autonomous (!auto override)
            finalMode = 'autonomous';
            const result = await runAutonomous(plan, state, reporter, budgetedExecute, chatJid, fullOpts, [], mcpContext || undefined);
            success = result.success;
            allOutputs = result.outputs;
        }
        stepsCompleted = state.steps.filter((s) => s.status === 'done').length;
        stepsFailed = state.steps.filter((s) => s.status === 'failed').length;
        if (success) {
            const summary = [
                `✅ Task complete: ${plan.workspace.id}`,
                `${stepsCompleted}/${plan.subtasks.length} steps done · mode: ${finalMode}${escapeHatch ? ' (auto-switched)' : ''}`,
                `Output: ${plan.workspace.outputDir}`,
            ].join('\n');
            await reporter.finish(summary);
        }
        else {
            await reporter.error(`Task failed after ${stepsFailed} step failures. Check ${plan.workspace.progressFile} for details.`);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('BUDGET_EXCEEDED')) {
            log.warn({ callCount, maxCalls: fullOpts.maxCalls, workspace: plan.workspace.id }, 'Task stopped: call budget exhausted');
            await reporter.error(`⛔ Task stopped: hit the ${fullOpts.maxCalls}-call limit after ${callCount} container invocations.\nIncrease MAX_TASK_CALLS in .env or split this into smaller tasks.`);
        }
        else if (msg.startsWith('BUDGET_BLOCKED:')) {
            budgetBlockedReason = msg.replace('BUDGET_BLOCKED:', '');
            log.warn({ budgetBlockedReason, callCount, workspace: plan.workspace.id }, 'Task stopped: budget policy block');
            await reporter.error(`⛔ Task blocked by budget policy: ${budgetBlockedReason}`);
        }
        else if (msg.startsWith('INFRA_DENIED:')) {
            const denialReason = msg.replace('INFRA_DENIED:', '');
            log.warn({ denialReason, workspace: plan.workspace.id }, 'Task stopped: app infra authority denied execution');
            await reporter.error(`⛔ Task blocked by app infra authority: ${denialReason}`);
        }
        else {
            log.error({ err, workspace: plan.workspace.id }, 'Task runner unexpected error');
            await reporter.error(`Unexpected error: ${msg}`);
        }
        success = false;
    }
    updateTask(plan.workspace.id, { mcpExecutedSteps });
    return {
        success,
        mode: startingMode,
        finalMode,
        stepsCompleted,
        stepsFailed,
        escapeHatchTriggered: escapeHatch,
        outputs: allOutputs,
        budget_blocked_reason: budgetBlockedReason,
        spend_summary: {
            task_spent_usd: getOrInitTaskSpend(plan.workspace.id, effectiveMode).spent,
            call_count: getOrInitTaskSpend(plan.workspace.id, effectiveMode).calls,
            mode: effectiveMode,
        },
        escalation_spend: getOrInitTaskSpend(plan.workspace.id, effectiveMode).escalationSpent,
        mcp_executed_steps: mcpExecutedSteps,
    };
}
//# sourceMappingURL=task-runner.js.map