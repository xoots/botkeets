/**
 * Drip-Feed Executor
 *
 * Sequential micro-task executor. Processes a plan's subtasks one at a time,
 * injecting memory context and summarized previous results between steps.
 *
 * Reuses:
 *   ContainerExecuteFn IoC callback  — task-runner.ts (no circular imports)
 *   StagingCache                     — staging-cache.ts
 *   MicroTask                        — memory-types.ts
 *   decideStepRouting()              — step-router.ts (model escalation)
 *   Graceful degradation             — memory-session.ts pattern
 *   Fire-and-forget signal           — task-classifier.ts pattern
 *
 * Returns TaskRunResult → executeAndFinalize() consumers unchanged.
 */
import { decideStepRouting } from './step-router.js';
import * as StagingCache from './staging-cache.js';
import { logger } from './logger.js';
import { MicroTaskArraySchema, safeParseWithFallback } from './drip-feed-schemas.js';
import { tryDeterministicExecution } from './deterministic-executor.js';
import { reflectOnFailure } from './failure-reflection.js';
import { emitSignal } from './memory-signal-emitter.js';
import { resolveProjectIdFromContent } from './memory-project-resolver.js';
import { appendEpisodeToProjectMemory } from './episodic-compression.js';
import { getSkillHints } from './skill-loader.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;
const SUMMARY_MAX_CHARS = 800;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Convert PlanSubtasks → MicroTasks for staging. */
function subtasksToMicros(planId, subtasks) {
    const micros = subtasks.map((s, i) => ({
        id: `${planId}-micro-${s.step}`,
        parent_task_id: planId,
        title: s.description,
        description: s.description,
        status: 'pending',
        priority: i,
        created_at_unix: Math.floor(Date.now() / 1000),
    }));
    return safeParseWithFallback(micros, MicroTaskArraySchema, micros, `subtasksToMicros:${planId}`);
}
/** Compact a raw output for context injection into the next micro. */
function compactOutput(raw) {
    if (raw.length <= SUMMARY_MAX_CHARS)
        return raw;
    const head = raw.slice(0, Math.floor(SUMMARY_MAX_CHARS * 0.6));
    const tail = raw.slice(-Math.floor(SUMMARY_MAX_CHARS * 0.25));
    return `${head}\n…[compacted]…\n${tail}`;
}
/** Build the prompt for a micro, injecting memory anchor + previous results. */
function buildMicroPrompt(micro, previousResults, anchorContext) {
    const parts = [];
    if (anchorContext) {
        parts.push(`<memory_context>\n${anchorContext}\n</memory_context>`);
    }
    // Inject role-specific skill hints
    const skillHints = getSkillHints(micro.description);
    if (skillHints) {
        parts.push(skillHints);
    }
    if (previousResults.length > 0) {
        const summaries = previousResults
            .map((r) => `[${r.success ? 'OK' : 'FAIL'}] ${r.title}: ${r.summary}`)
            .join('\n');
        parts.push(`<previous_results>\n${summaries}\n</previous_results>`);
    }
    parts.push(`<current_task>\n${micro.description}\n</current_task>`);
    return parts.join('\n\n');
}
/**
 * Detect if an output reveals new work that should be dynamically appended.
 * Looks for structured markers the container agent emits.
 */
function detectNewWork(output) {
    const markers = /(?:TODO|ADDITIONAL STEP NEEDED|FOLLOW-UP|NEW REQUIREMENT):\s*(.+)/gi;
    const tasks = [];
    let match;
    while ((match = markers.exec(output)) !== null) {
        tasks.push(match[1].trim());
    }
    return tasks;
}
/** Create a synthetic PlanSubtask for dynamic inserts (routing needs one). */
function syntheticSubtask(description, step) {
    return {
        step,
        description,
        tool: 'bash',
        dependsOn: [],
        estimatedMs: 5000,
        risk_level: 'medium',
    };
}
/**
 * Execute a plan's subtasks sequentially as micro-tasks.
 *
 * For each MicroTask in dependency order:
 *   1. Inject memory anchor + summarized previous results from StagingCache
 *   2. Execute via containerExecute callback (same ContainerExecuteFn as runTask)
 *   3. Stage result in cache
 *   4. On failure: retry up to 3×, escalate model tier (eco → standard → pro)
 *   5. Compact context between micros (clear raw outputs, keep summaries)
 *
 * Dynamic micro insertion: if a result reveals new work, decompose and append.
 * Final synthesis: aggregate all staged results into unified output.
 *
 * @returns TaskRunResult — same type as runTask(), downstream code unchanged.
 */
export async function dripFeedExecute(plan, _channel, chatJid, containerExecute, opts = {}) {
    const taskId = plan.workspace?.id ?? `drip-${Date.now()}`;
    const results = [];
    let stepsCompleted = 0;
    let stepsFailed = 0;
    let escapeHatchTriggered = false;
    const allOutputs = [];
    // 1. Convert plan subtasks → MicroTasks and stage them
    const micros = subtasksToMicros(taskId, plan.subtasks);
    StagingCache.stage(taskId, micros);
    logger.info({ taskId, microCount: micros.length }, 'drip-feed: starting sequential execution');
    // 2. Process each micro-task in priority order
    let nextStep = plan.subtasks.length + 1;
    while (true) {
        const micro = StagingCache.nextPending(taskId);
        if (!micro)
            break;
        StagingCache.updateStatus(taskId, micro.id, 'running');
        // Find matching PlanSubtask for routing decisions
        const matchingSubtask = plan.subtasks.find((s) => s.description === micro.description);
        const subtaskForRouting = matchingSubtask ?? syntheticSubtask(micro.description, nextStep);
        let success = false;
        let output = '';
        let lastAttempt = 0;
        // Try deterministic execution first — zero tokens, no model call
        const deterministicResult = await tryDeterministicExecution(micro, plan.workspace?.workspaceDir);
        if (deterministicResult !== null) {
            success = true;
            output = deterministicResult;
            logger.info({ taskId, microId: micro.id, hint: micro.execution_hint }, 'drip-feed: micro completed deterministically — zero tokens used');
        }
        // Fall back to model-based execution if deterministic failed or not applicable
        if (!success) {
            // Retry loop with model tier escalation
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                lastAttempt = attempt;
                try {
                    // decideStepRouting escalates model on higher attempt numbers
                    const routingDecision = opts.routingContext
                        ? decideStepRouting(subtaskForRouting, opts.routingContext, attempt)
                        : undefined;
                    const prompt = buildMicroPrompt(micro, results, opts.anchorContext);
                    output = await containerExecute(prompt, chatJid, opts.vaultEnv, routingDecision, opts.sessionId);
                    if (output.trim().startsWith('STEP_FAILED:')) {
                        throw new Error(output.trim());
                    }
                    success = true;
                    break;
                }
                catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    logger.warn({ err, taskId, microId: micro.id, attempt }, 'drip-feed: micro-task failed — reflecting on failure');
                    // Reflect instead of blind retry
                    if (attempt < MAX_RETRIES) {
                        const previousContext = results
                            .map((r) => `${r.title}: ${r.summary}`)
                            .join('\n');
                        const reflection = await reflectOnFailure(micro.description, errorMsg, attempt, previousContext);
                        logger.info({
                            taskId,
                            microId: micro.id,
                            action: reflection.action,
                            cause: reflection.root_cause,
                        }, 'drip-feed: reflection result');
                        if (reflection.action === 'skip') {
                            break; // Skip this micro entirely
                        }
                        if (reflection.action === 'retry_modified' && reflection.modified_prompt) {
                            micro.description = reflection.modified_prompt;
                        }
                        // 'retry' and 'escalate' continue — escalation handled by decideStepRouting(attempt)
                    }
                    if (attempt === MAX_RETRIES) {
                        escapeHatchTriggered = true;
                    }
                }
            }
        } // end if (!success)
        if (success) {
            StagingCache.updateStatus(taskId, micro.id, 'done');
            setImmediate(() => {
                try {
                    const projectId = resolveProjectIdFromContent(micro.description);
                    if (projectId)
                        emitSignal(projectId, 'step_execution', 1.0, taskId);
                }
                catch { /* silently ignore */ }
            });
            stepsCompleted++;
            // Stage compacted result for context injection into subsequent micros
            results.push({
                microId: micro.id,
                title: micro.title,
                success: true,
                summary: compactOutput(output),
            });
            allOutputs.push(output);
            // Dynamic micro insertion — best-effort, never blocks
            try {
                const newWork = detectNewWork(output);
                if (newWork.length > 0) {
                    const currentMicros = StagingCache.getAll(taskId);
                    const dynamicMicros = newWork.map((desc, i) => ({
                        id: `${taskId}-dynamic-${nextStep + i}`,
                        parent_task_id: taskId,
                        title: desc,
                        description: desc,
                        status: 'pending',
                        priority: currentMicros.length + i,
                        created_at_unix: Math.floor(Date.now() / 1000),
                    }));
                    StagingCache.stage(taskId, [...currentMicros, ...dynamicMicros]);
                    nextStep += newWork.length;
                    logger.info({ taskId, newMicros: newWork.length }, 'drip-feed: dynamically inserted new micro-tasks');
                }
            }
            catch { /* dynamic insertion is best-effort — silently ignore */ }
        }
        else {
            StagingCache.updateStatus(taskId, micro.id, 'failed');
            setImmediate(() => {
                try {
                    const projectId = resolveProjectIdFromContent(micro.description);
                    if (projectId)
                        emitSignal(projectId, 'step_failure', 0.8, taskId);
                }
                catch { /* silently ignore */ }
            });
            stepsFailed++;
            results.push({
                microId: micro.id,
                title: micro.title,
                success: false,
                summary: `Failed after ${lastAttempt} attempts`,
            });
        }
    }
    // 3. Final synthesis
    const finalCounts = StagingCache.counts(taskId);
    const overallSuccess = finalCounts.failed === 0 && stepsCompleted > 0;
    logger.info({ taskId, ...finalCounts, overallSuccess }, 'drip-feed: execution complete');
    // Clean up staging cache
    StagingCache.clear(taskId);
    // Fire-and-forget: compress episode and append to project memory
    setImmediate(() => {
        try {
            const episodicResults = results.map(r => ({
                microId: r.microId,
                title: r.title,
                success: r.success,
                summary: r.summary,
            }));
            appendEpisodeToProjectMemory(taskId, plan.planMarkdown ?? '', episodicResults);
        }
        catch { /* silently ignore */ }
    });
    return {
        success: overallSuccess,
        mode: 'structured',
        finalMode: escapeHatchTriggered
            ? 'autonomous'
            : 'structured',
        stepsCompleted,
        stepsFailed,
        escapeHatchTriggered,
        outputs: allOutputs,
    };
}
//# sourceMappingURL=drip-feed-executor.js.map