/**
 * Execution Lifecycle Policy
 *
 * Extracted from container-runner.ts (Sprint B).
 * Handles: register task → load memory → run task → overseer → PR → update registry.
 * Returns a discriminated ExecutionOutcome — caller decides next step.
 */
import { runTask } from './task-runner.js';
import { dripFeedExecute } from './drip-feed-executor.js';
import { evaluateResult } from './overseer.js';
import { registerTask, updateTask } from './task-registry.js';
import { attemptPrCreation } from './pr-automation.js';
import { loadMemoryForTask } from './memory-session.js';
import { appendExecutionRunHistory } from './execution-run-history.js';
import { markKeetTaskRun } from './runtime-split.js';
import { savePendingProShardTask, clearPendingProShardTask } from './pro-shard-pending-store.js';
import { logger, childLogger } from './logger.js';
import { verifyTaskOutput } from './verification-policy.js';
import { extractMem0Facts } from './memory-mem0-extractor.js';
import { resolveProjectIdFromContent, autoRegisterProject } from './memory-project-resolver.js';
import { scanForAdjustments, formatAdjustmentHints } from './pre-task-reflection.js';
import { assembleGroupMemoryAnchor, appendToJournal, mergeIntoMemory } from './group-memory.js';
import { upsertCanonicalSummary, getRegisteredGroup } from './db.js';
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Determine whether the drip-feed execution path should be used.
 *
 * Auto-activation: subtasks >= 3 AND structured mode AND not !auto override.
 * Explicit activation: !drip override tag.
 * Fallback: if drip-feed fails catastrophically, caller falls back to runTask() autonomous.
 */
export function shouldUseDripFeed(planResult, execMode, dripFeedOverride, noDrip = false) {
    // Explicit opt-out via !nodrip always wins
    if (noDrip)
        return false;
    // Explicit opt-in via !drip
    if (dripFeedOverride)
        return true;
    // Auto-activation criteria
    return (planResult.subtasks.length >= 3
        && execMode === 'structured');
}
export function statusPatchFromTaskResult(result) {
    if (result.budget_blocked_reason === 'awaiting_pro_shard_approval') {
        return { status: 'awaiting_pro_shard_approval' };
    }
    if (!result.success) {
        return { status: 'failed', completedAt: Date.now() };
    }
    return { status: 'done', completedAt: Date.now() };
}
// ── Main function ─────────────────────────────────────────────────────────────
/**
 * Execution phase: register task, load memory, run task,
 * evaluate with overseer, attempt PR, update registry.
 */
export async function executeAndFinalize(planResult, execMode, groupJid, telegram, containerExecute, vaultEnv, routingContext, options) {
    const log = options?.traceId ? childLogger(options.traceId) : logger;
    const taskBranch = `feat/${planResult.workspace.id}`;
    const taskSummary = options?.taskSummary ?? planResult.planMarkdown.slice(0, 80);
    registerTask({
        id: planResult.workspace.id,
        jid: groupJid,
        workspaceDir: planResult.workspace.workspaceDir,
        summary: taskSummary,
        branch: taskBranch,
    });
    const runStartedAt = Date.now();
    markKeetTaskRun();
    const memCtx = await loadMemoryForTask(planResult.planMarkdown, routingContext.effective_mode, planResult.workspace.id);
    const groupReg = getRegisteredGroup(groupJid);
    const groupFolder = groupReg?.folder;
    let groupMemoryAnchor = '';
    if (groupFolder) {
        autoRegisterProject(groupFolder, taskSummary);
        groupMemoryAnchor = assembleGroupMemoryAnchor(groupFolder);
    }
    const useDripFeed = shouldUseDripFeed(planResult, execMode, options?.dripFeed ?? false, options?.noDrip ?? false);
    let result;
    // Pre-task reflection: scan signals for decomposition adjustments
    let adjustmentHints = '';
    if (useDripFeed) {
        const adjustment = scanForAdjustments(planResult.planMarkdown);
        adjustmentHints = formatAdjustmentHints(adjustment);
        if (adjustment.hints.length > 0) {
            log.info({ workspace: planResult.workspace.id, hints: adjustment.hints }, 'Pre-task reflection adjustments');
        }
    }
    if (useDripFeed) {
        log.info({ workspace: planResult.workspace.id, subtasks: planResult.subtasks.length }, 'Using drip-feed execution path');
        try {
            result = await dripFeedExecute(planResult, telegram, groupJid, containerExecute, {
                anchorContext: groupMemoryAnchor + (memCtx?.anchor.content ?? options?.injectedAnchorContext?.anchorContent ?? '') + adjustmentHints,
                routingContext,
                vaultEnv,
            });
        }
        catch (err) {
            // Fallback: if drip-feed fails catastrophically, fall back to runTask() autonomous
            log.warn({ err, workspace: planResult.workspace.id }, 'Drip-feed failed — falling back to autonomous runTask');
            result = await runTask(planResult, telegram, groupJid, containerExecute, vaultEnv, {
                mode: 'autonomous',
                originalMsgId: options?.originalMsgId,
                routingContext,
                traceId: options?.traceId,
                injectedAnchorContext: memCtx
                    ? { anchorContent: groupMemoryAnchor + memCtx.anchor.content, userContext: '' }
                    : options?.injectedAnchorContext
                        ? { anchorContent: groupMemoryAnchor + options.injectedAnchorContext.anchorContent, userContext: options.injectedAnchorContext.userContext }
                        : groupMemoryAnchor
                            ? { anchorContent: groupMemoryAnchor, userContext: '' }
                            : undefined,
            });
        }
    }
    else {
        result = await runTask(planResult, telegram, groupJid, containerExecute, vaultEnv, {
            mode: execMode,
            originalMsgId: options?.originalMsgId,
            clarificationAnswers: options?.clarificationAnswers,
            routingContext,
            traceId: options?.traceId,
            injectedAnchorContext: memCtx
                ? { anchorContent: groupMemoryAnchor + memCtx.anchor.content, userContext: '' }
                : options?.injectedAnchorContext
                    ? { anchorContent: groupMemoryAnchor + options.injectedAnchorContext.anchorContent, userContext: options.injectedAnchorContext.userContext }
                    : groupMemoryAnchor
                        ? { anchorContent: groupMemoryAnchor, userContext: '' }
                        : undefined,
        });
    }
    appendExecutionRunHistory({
        ts: new Date().toISOString(),
        task_id: planResult.workspace.id,
        chat_jid: groupJid,
        path_used: 'keet',
        lane_used: 'keet_execution',
        success: result.success,
        latency_ms: Date.now() - runStartedAt,
        mcp_executed_steps: result.mcp_executed_steps,
    });
    log.info({ workspace: planResult.workspace.id, ...result }, 'Task runner complete');
    // ── Verification — check artifacts before proceeding ──────────────────────────
    let verificationSummary;
    if (result.success) {
        const verificationReport = await verifyTaskOutput(planResult.workspace.workspaceDir, taskSummary.slice(0, 200), result.outputs);
        verificationSummary = verificationReport.summary;
        if (verificationReport.suggestedAction === 'reprompt') {
            log.info({ workspace: planResult.workspace.id, checks: verificationReport.checks }, 'Verification failed — reprompting');
            const retryResult = await runTask(planResult, telegram, groupJid, containerExecute, vaultEnv, {
                mode: 'autonomous',
                originalMsgId: options?.originalMsgId,
                routingContext,
                traceId: options?.traceId,
                injectedAnchorContext: {
                    anchorContent: `VERIFICATION FAILED:\n${verificationReport.summary}\n\nFix these issues:\n${verificationReport.repromptHint ?? ''}`,
                    userContext: '',
                },
            });
            // Use retry result going forward
            result = retryResult;
            verificationSummary = undefined; // don't double-count
        }
    }
    // ── Pro-shard budget block — save for later approval ─────────────────────────
    if (result.budget_blocked_reason === 'awaiting_pro_shard_approval') {
        updateTask(planResult.workspace.id, statusPatchFromTaskResult(result));
        savePendingProShardTask({
            taskId: planResult.workspace.id,
            groupJid,
            planResult,
            vaultEnv,
            execMode,
            routingContext,
            originalMsgId: options?.originalMsgId,
            createdAt: Date.now(),
        });
        await telegram.sendMessage(groupJid, `⏸ Pro task paused: ${planResult.workspace.id}\nApproval required before sharded execution.\nApprove via POST /api/tasks/${planResult.workspace.id}/pro-shard/approve.`);
        return {
            success: false,
            result,
            overseerAction: { action: 'escalate', reason: 'awaiting_pro_shard_approval' },
        };
    }
    // ── Overseer evaluation ───────────────────────────────────────────────────────
    const overseerDecision = await evaluateResult(planResult.workspace.id, taskSummary, result, verificationSummary);
    if (overseerDecision.action === 'reprompt') {
        log.info({ workspace: planResult.workspace.id, newPrompt: overseerDecision.newPrompt.slice(0, 80) }, 'Overseer reprompting task');
        await telegram.sendMessage(groupJid, `🔄 Retrying task with revised approach...`);
        const retryResult = await runTask(planResult, telegram, groupJid, containerExecute, vaultEnv, {
            mode: 'autonomous',
            originalMsgId: options?.originalMsgId,
            routingContext,
            traceId: options?.traceId,
            injectedAnchorContext: memCtx
                ? { anchorContent: memCtx.anchor.content, userContext: '' }
                : undefined,
        });
        appendExecutionRunHistory({
            ts: new Date().toISOString(),
            task_id: planResult.workspace.id,
            chat_jid: groupJid,
            path_used: 'keet',
            lane_used: 'keet_execution',
            success: retryResult.success,
            latency_ms: 0,
            mcp_executed_steps: retryResult.mcp_executed_steps,
        });
        updateTask(planResult.workspace.id, statusPatchFromTaskResult(retryResult));
        clearPendingProShardTask(planResult.workspace.id);
        return {
            success: retryResult.success,
            result: retryResult,
            overseerAction: overseerDecision,
        };
    }
    if (overseerDecision.action === 'escalate') {
        await telegram.sendMessage(groupJid, `⚠️ Task needs your input: ${planResult.workspace.id}\n\nReason: ${overseerDecision.reason}\n\nOutputs so far:\n${result.outputs.slice(0, 3).join('\n')}`);
        updateTask(planResult.workspace.id, statusPatchFromTaskResult(result));
        clearPendingProShardTask(planResult.workspace.id);
        return {
            success: false,
            result,
            overseerAction: overseerDecision,
        };
    }
    // ── action === 'complete' ─────────────────────────────────────────────────────
    const pr = await attemptPrCreation(planResult.workspace.workspaceDir, taskBranch, taskSummary);
    updateTask(planResult.workspace.id, pr
        ? { status: 'pr_open', prNumber: pr.prNumber, prUrl: pr.prUrl }
        : statusPatchFromTaskResult(result));
    clearPendingProShardTask(planResult.workspace.id);
    // Fire-and-forget memory extraction — group-scoped + project-scoped
    if (result.success) {
        setImmediate(() => {
            try {
                // Stopgap: group-scoped flat-file memory
                if (groupFolder) {
                    const extractContent = [taskSummary, ...result.outputs.slice(0, 3)].join('\n').slice(0, 6000);
                    extractMem0Facts(extractContent, groupFolder)
                        .then(mem0 => {
                        if (mem0.facts) {
                            appendToJournal(groupFolder, taskSummary, mem0.facts);
                            mergeIntoMemory(groupFolder, mem0.facts);
                            log.debug({ groupFolder, factLen: mem0.facts.length }, 'group-memory: facts persisted');
                        }
                    })
                        .catch(err => log.debug({ err, groupFolder }, 'group-memory: extraction failed'));
                }
                // Existing: project-scoped DB memory
                const projectId = resolveProjectIdFromContent(taskSummary);
                if (projectId) {
                    extractMem0Facts(taskSummary, projectId)
                        .then(mem0 => {
                        if (mem0.facts)
                            upsertCanonicalSummary(projectId, mem0.facts);
                    })
                        .catch(err => log.debug({ err, projectId }, 'mem0 extraction failed post-task'));
                }
            }
            catch { /* memory must never crash execution lifecycle */ }
        });
    }
    return {
        success: result.success,
        result,
        overseerAction: overseerDecision,
        prUrl: pr?.prUrl,
        prNumber: pr?.prNumber,
    };
}
//# sourceMappingURL=execution-lifecycle.js.map