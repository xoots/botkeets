/**
 * Approval Policy
 *
 * Extracted from container-runner.ts (Sprint B).
 * Handles: plan approval gate → clarification questions → pro-shard budget gate → exec mode selection.
 * Returns an ApprovalOutcome discriminated union — caller decides next step.
 */
import { setPending, } from './clarification-store.js';
import { parseOverrides } from './override-parser.js';
import { setGroupConcurrency } from './group-queue.js';
import { logger } from './logger.js';
// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPlanPreview(plan) {
    const lines = [];
    for (const s of plan.subtasks) {
        lines.push(`${s.step}. [${s.tool}] ${s.description}`);
    }
    if (plan.credentialKeys.length > 0) {
        lines.push(`\nRequired credentials: ${plan.credentialKeys.join(', ')}`);
    }
    return lines.join('\n');
}
// ── Main function ─────────────────────────────────────────────────────────────
/**
 * Approval phase: check plan approval gate, clarification questions,
 * pro-shard budget gate. Returns outcome — caller decides next step.
 */
export async function approveAndClarify(planResult, taskText, groupJid, telegram, routingContext) {
    // ── Determine execution mode from inline override or smart default ─────────────
    let execMode = 'structured';
    if (routingContext.inline_override === 'auto')
        execMode = 'autonomous';
    // High complexity + verification issues → autonomous is safer
    if (!planResult.planMarkdown.includes('Plan verified ✓') && planResult.subtasks.length > 6) {
        execMode = 'autonomous';
    }
    // ── Parse override tags from task text ────────────────────────────────────────
    const overrideResult = parseOverrides(taskText);
    const { skipPlanApproval, parallelOverride, dripFeed, noDrip, planMode } = overrideResult;
    // Apply concurrency override from !parallel / !parallel3
    if (parallelOverride > 1) {
        setGroupConcurrency(groupJid, parallelOverride);
    }
    // ── Plan approval gate ────────────────────────────────────────────────────────
    const REQUIRE_PLAN_APPROVAL = process.env.REQUIRE_PLAN_APPROVAL === 'true';
    const needsApproval = REQUIRE_PLAN_APPROVAL
        && planResult.needs_decomposition
        && !skipPlanApproval;
    if (needsApproval) {
        const planPreview = formatPlanPreview(planResult);
        await telegram.sendMessage(groupJid, `Plan ready for review:\n\n${planPreview}\n\nSend \`!go\` to execute or \`!fast\` to skip review in future.`);
        setPending(groupJid, {
            jid: groupJid,
            planResult,
            execMode,
            vaultKeys: planResult.credentialKeys,
            type: 'plan_approval',
            dripFeed,
            noDrip,
            parallelOverride,
            planMode,
            effectiveMode: routingContext.effective_mode,
        });
        logger.info({ groupJid, workspaceId: planResult.workspace.id }, 'Plan approval gate: paused for review');
        return { kind: 'paused_for_approval', reason: 'plan_review' };
    }
    // ── Surface clarifying questions ──────────────────────────────────────────────
    if (planResult.clarifications.length > 0) {
        const questions = planResult.clarifications
            .map((q) => `• ${q.question}\n  Options: ${q.options.join(' | ')}`)
            .join('\n\n');
        await telegram.sendMessage(groupJid, `🗂 Before I start, a few questions:\n\n${questions}\n\nReply to answer, or send \`!go\` to proceed with the default plan.`);
        setPending(groupJid, {
            jid: groupJid,
            planResult,
            execMode,
            vaultKeys: planResult.credentialKeys,
            dripFeed,
            noDrip,
            parallelOverride,
            planMode,
            effectiveMode: routingContext.effective_mode,
        });
        logger.info({ groupJid, workspaceId: planResult.workspace.id, questionCount: planResult.clarifications.length }, 'Approval gate: paused for clarification');
        return { kind: 'paused_for_approval', reason: 'clarification' };
    }
    // ── Approved — proceed to execution ──────────────────────────────────────────
    return { kind: 'approved', execMode, planResult, dripFeed, noDrip };
}
//# sourceMappingURL=approval-policy.js.map