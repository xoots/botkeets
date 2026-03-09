/**
 * Intake Policy
 *
 * Extracted from container-runner.ts (Sprint B).
 * Handles: pro-shard resume check → load messages → classify → direct path → clarification resume.
 * Returns an IntakeOutcome discriminated union — caller decides next step.
 */
import { normalizeRoutingInput, resolveExecutionRoutingContext, resolveExecutionLaneDecision } from './execution-routing.js';
import { classifyTask } from './task-classifier.js';
import { runTask } from './task-runner.js';
import { getNewMessages } from './db.js';
import { runDirectForGroup } from './direct-runner.js';
import { hasPending, getPending, clearPending, parseAnswers, } from './clarification-store.js';
import { setGroupConcurrency } from './group-queue.js';
import { readVault } from './project-workspace.js';
import { loadMemoryForTask } from './memory-session.js';
import { attemptPrCreation } from './pr-automation.js';
import { updateTask } from './task-registry.js';
import { statusPatchFromTaskResult, executeAndFinalize } from './execution-lifecycle.js';
import { findPendingProShardTaskByGroup, clearPendingProShardTask, } from './pro-shard-pending-store.js';
import { getProShardApproval } from './pro-shard-approvals.js';
import { ASSISTANT_NAME, COPAW_ENABLED } from './config.js';
import { getCoPawLaneHealth } from './copaw-lane-bridge.js';
import { logger } from './logger.js';
import { categorizeFailure, executeRecovery } from './failure-taxonomy.js';
export function shouldAttemptDirectPath(classification) {
    return classification.task_type !== 'code' && classification.task_type !== 'complex';
}
// ── Main function ─────────────────────────────────────────────────────────────
/**
 * Intake phase: load messages, classify, attempt direct path,
 * check for pending clarification resume AND pro-shard resume.
 * Returns an IntakeOutcome discriminated union — caller decides next step.
 *
 * Note: timestamp is a string (matches state.lastAgentTimestamp storage format).
 * containerExecute must be passed to avoid circular imports with container-runner.ts.
 */
export async function intakeAndClassify(groupJid, telegram, lastTimestamp, containerExecute, recoveryHandlers) {
    // ── Pro-shard resume: check BEFORE loading messages ──────────────────────────
    const pendingProShard = findPendingProShardTaskByGroup(groupJid);
    if (pendingProShard) {
        const approval = getProShardApproval(pendingProShard.taskId);
        if (approval?.approved) {
            logger.info({ groupJid, taskId: pendingProShard.taskId }, 'Resuming pro-shard task after approval');
            const memCtx = await loadMemoryForTask(pendingProShard.planResult.planMarkdown, pendingProShard.routingContext?.effective_mode ?? 'standard', pendingProShard.planResult.workspace.id);
            const proShardExecute = (p, jid, v, d, sid) => containerExecute(p, jid, v ?? pendingProShard.vaultEnv, d, sid);
            const resumed = await runTask(pendingProShard.planResult, telegram, groupJid, proShardExecute, pendingProShard.vaultEnv, {
                mode: pendingProShard.execMode,
                originalMsgId: pendingProShard.originalMsgId,
                routingContext: pendingProShard.routingContext,
                injectedAnchorContext: memCtx
                    ? { anchorContent: memCtx.anchor.content, userContext: '' }
                    : undefined,
            });
            if (resumed.success) {
                const taskBranch = `feat/${pendingProShard.planResult.workspace.id}`;
                const pr = await attemptPrCreation(pendingProShard.planResult.workspace.workspaceDir, taskBranch, pendingProShard.planResult.workspace.id);
                updateTask(pendingProShard.taskId, pr
                    ? { status: 'pr_open', prNumber: pr.prNumber, prUrl: pr.prUrl }
                    : statusPatchFromTaskResult(resumed));
            }
            else {
                updateTask(pendingProShard.taskId, statusPatchFromTaskResult(resumed));
            }
            clearPendingProShardTask(pendingProShard.taskId);
            return { kind: 'resumed_pro_shard', result: resumed, timestamp: lastTimestamp };
        }
    }
    // ── Load new messages ─────────────────────────────────────────────────────────
    const { messages, newTimestamp } = getNewMessages([groupJid], lastTimestamp, ASSISTANT_NAME);
    // ── Clarification / plan-approval resume ────────────────────────────────────
    // Check BEFORE no_messages return: plan UI Execute click triggers resume
    // without producing a message. Also prevents !go from being swallowed by the
    // direct path classifier.
    if (hasPending(groupJid)) {
        const pending = getPending(groupJid);
        const latestText = messages[messages.length - 1]?.content ?? '';
        const answers = parseAnswers(latestText, pending);
        clearPending(groupJid);
        // Restore concurrency override from pending state (lost in-memory on pause)
        if (pending.parallelOverride && pending.parallelOverride > 1) {
            setGroupConcurrency(groupJid, pending.parallelOverride);
        }
        // Build routing context from stored effective_mode (no classification needed)
        const resumeMode = pending.effectiveMode ?? 'standard';
        const resumeRoutingContext = {
            requested_mode: resumeMode,
            effective_mode: resumeMode,
            source: 'inline_override',
            inline_override: resumeMode,
            clean_content: latestText,
        };
        logger.info({ groupJid, answers, resumeMode }, 'Resuming task after clarification/plan-approval');
        try {
            const lastMsg = messages[messages.length - 1];
            const resumedVault = readVault(pending.planResult.workspace);
            const clarVaultEnv = pending.vaultKeys.length > 0
                ? Object.fromEntries(Object.entries(resumedVault).filter(([k]) => pending.vaultKeys.includes(k)))
                : resumedVault;
            const clarExecute = (p, jid, v, d, sid) => containerExecute(p, jid, v ?? clarVaultEnv, d, sid);
            const { result } = await executeAndFinalize(pending.planResult, pending.execMode, groupJid, telegram, clarExecute, clarVaultEnv, resumeRoutingContext, {
                originalMsgId: lastMsg?.id ?? undefined,
                clarificationAnswers: answers,
                dripFeed: pending.dripFeed ?? false,
                noDrip: pending.noDrip ?? false,
            });
            logger.info({ workspace: pending.planResult.workspace.id, ...result }, 'Task runner complete (resumed)');
            if (result.success) {
                const resumedBranch = `feat/${pending.planResult.workspace.id}`;
                const pr = await attemptPrCreation(pending.planResult.workspace.workspaceDir, resumedBranch, pending.planResult.workspace.id);
                updateTask(pending.planResult.workspace.id, pr
                    ? { status: 'pr_open', prNumber: pr.prNumber, prUrl: pr.prUrl }
                    : statusPatchFromTaskResult(result));
            }
            else {
                updateTask(pending.planResult.workspace.id, statusPatchFromTaskResult(result));
            }
            return { kind: 'resumed_clarification', result, timestamp: newTimestamp };
        }
        catch (err) {
            const failure = categorizeFailure(err, { phase: 'intake', groupJid });
            if (recoveryHandlers) {
                const handled = await executeRecovery(failure, recoveryHandlers);
                if (handled)
                    return { kind: 'recovered' };
            }
            // Fall through to normal pipeline below
        }
    }
    if (messages.length === 0) {
        logger.debug({ groupJid }, 'No new messages to process');
        return { kind: 'no_messages' };
    }
    // ── Classify + resolve routing context ────────────────────────────────────────
    const combinedTextRaw = messages.map((m) => m.content).join('\n');
    const combinedText = normalizeRoutingInput(combinedTextRaw);
    const classification = await classifyTask(combinedText.slice(0, 500));
    const useDirect = shouldAttemptDirectPath(classification);
    const needsContainer = !useDirect;
    const routingContext = resolveExecutionRoutingContext(groupJid, combinedTextRaw, classification.recommended_mode, resolveExecutionLaneDecision({
        effective_mode: (classification.recommended_mode === 'auto' ? 'standard' : classification.recommended_mode),
        classification,
        needs_container: needsContainer,
        copaw_enabled: COPAW_ENABLED,
        copaw_healthy: !getCoPawLaneHealth().circuit_open,
    }));
    // Map 6-bucket classifier to 4-value Intent that runDirectForGroup expects.
    const directIntent = (classification.task_type === 'research' ? 'business'
        : classification.task_type === 'code' ? 'complex'
            : classification.task_type);
    // ── Direct path attempt ───────────────────────────────────────────────────────
    if (useDirect) {
        logger.info({ groupJid, task_type: classification.task_type, reasoning: classification.reasoning }, 'Direct path — no container');
        const directResult = await runDirectForGroup(groupJid, telegram, messages, directIntent, routingContext, classification);
        if (directResult.handled) {
            return { kind: 'handled_direct', timestamp: newTimestamp };
        }
        // Outcome-based failure: direct-runner returned handled:false — promote to container
        const directFailure = categorizeFailure(null, {
            phase: 'intake', groupJid, outcomeCategory: 'direct_path_unhandled',
        });
        if (recoveryHandlers) {
            const handled = await executeRecovery(directFailure, recoveryHandlers);
            if (handled)
                return { kind: 'recovered' };
        }
        logger.warn({ groupJid, task_type: classification.task_type, fallback_reason: directResult.fallback_reason, lane_used: directResult.lane_used }, 'Direct path failed — falling back to container');
    }
    // ── Needs full planning ───────────────────────────────────────────────────────
    return { kind: 'needs_planning', messages, classification, routingContext, timestamp: newTimestamp };
}
//# sourceMappingURL=intake-policy.js.map