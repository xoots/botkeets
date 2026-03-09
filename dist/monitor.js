/**
 * Monitor Loop
 *
 * Runs every 10 minutes and closes the feedback loop between agent execution
 * and the human. Responsibilities:
 *
 *   1. PR-open tasks  — poll `gh pr checks` for CI status.
 *                       On green: notify via Telegram/Discord + mark ci_passed.
 *                       On red:   send a warning with the PR link.
 *
 *   2. Stale tasks    — warn if a task has been "running" for > 40 min.
 *                       This catches hung containers before the user notices.
 *
 *   3. Prune          — remove registry entries older than 7 days once per cycle.
 *
 * This module is purely additive — it never touches task execution and all
 * failures are caught and logged without crashing the main loop.
 */
import { spawnSync } from 'child_process';
import { logger } from './logger.js';
import { getTasksByStatus, updateTask, pruneCompleted, } from './task-registry.js';
import { CONTAINER_HARD_KILL_MS, DEDUP_RETENTION_HOURS } from './config.js';
import { pruneProcessedMessages } from './db.js';
const MONITOR_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const STALE_THRESHOLD_MS = 40 * 60 * 1000; // warn after 40 min running
/**
 * Query GitHub CI status for a PR number.
 * Requires `gh` CLI to be authenticated.
 * Returns 'unknown' if gh is unavailable or the output can't be parsed.
 */
function queryCiStatus(task) {
    if (!task.prNumber)
        return 'unknown';
    try {
        const result = spawnSync('gh', ['pr', 'checks', String(task.prNumber), '--json', 'name,state'], { cwd: task.workspaceDir, encoding: 'utf-8', timeout: 15_000 });
        if (result.status !== 0 || !result.stdout.trim())
            return 'unknown';
        const checks = JSON.parse(result.stdout);
        if (!checks.length)
            return 'pending';
        if (checks.every((c) => c.state === 'SUCCESS'))
            return 'passing';
        if (checks.some((c) => c.state === 'FAILURE' || c.state === 'ERROR'))
            return 'failing';
        return 'pending';
    }
    catch {
        return 'unknown';
    }
}
// ── Monitor cycle ─────────────────────────────────────────────────────────────
async function runCycle(channel) {
    const now = Date.now();
    // 1. Check CI on open PRs
    for (const task of getTasksByStatus('pr_open')) {
        const ci = queryCiStatus(task);
        if (ci === 'passing') {
            updateTask(task.id, { status: 'ci_passed' });
            await channel.sendMessage(task.jid, `✅ PR #${task.prNumber} ready to merge\n\n` +
                `*${task.summary}*\n\n` +
                `All CI checks passed · ${task.prUrl}`);
            logger.info({ id: task.id, prNumber: task.prNumber }, 'monitor: CI passed');
        }
        else if (ci === 'failing') {
            await channel.sendMessage(task.jid, `⚠️ PR #${task.prNumber} — CI failing\n\n` +
                `*${task.summary}*\n\n` +
                `${task.prUrl}`);
            logger.warn({ id: task.id, prNumber: task.prNumber }, 'monitor: CI failing');
        }
        // pending / unknown → check again next cycle
    }
    // 2. Warn on stale running tasks — force-kill if past hard ceiling
    for (const task of getTasksByStatus('running')) {
        const runningFor = now - task.startedAt;
        if (runningFor > CONTAINER_HARD_KILL_MS) {
            const mins = Math.round(runningFor / 60_000);
            updateTask(task.id, { status: 'failed', completedAt: now });
            await channel.sendMessage(task.jid, `💀 Task force-killed after ${mins} min (hard ceiling)\n\n` +
                `*${task.summary}*\n\n` +
                `Workspace: \`${task.workspaceDir}\``);
            logger.error({ id: task.id, mins }, 'monitor: force-killed hung task');
        }
        else if (runningFor > STALE_THRESHOLD_MS) {
            const mins = Math.round(runningFor / 60_000);
            await channel.sendMessage(task.jid, `⏱ Task still running after ${mins} min — may need attention\n\n` +
                `*${task.summary}*\n\n` +
                `Workspace: \`${task.workspaceDir}\``);
            logger.warn({ id: task.id, mins }, 'monitor: stale running task');
        }
    }
    // 3. Prune old completed entries
    const pruned = pruneCompleted();
    if (pruned > 0) {
        logger.info({ pruned }, 'monitor: pruned completed tasks');
    }
    // 4. Prune processed-message dedup entries
    try {
        const prunedDedup = pruneProcessedMessages(DEDUP_RETENTION_HOURS * 60 * 60 * 1000);
        if (prunedDedup > 0) {
            logger.info({ prunedDedup }, 'monitor: pruned processed_messages dedup entries');
        }
    }
    catch (err) {
        logger.warn({ err }, 'monitor: pruneProcessedMessages failed');
    }
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Start the monitoring loop. Call once from index.ts after channels connect.
 * Errors inside cycles are caught and logged — the loop never crashes.
 */
export function startMonitorLoop(channel, _queue) {
    logger.info({ intervalMs: MONITOR_INTERVAL_MS }, 'monitor: loop started');
    setInterval(async () => {
        try {
            await runCycle(channel);
        }
        catch (err) {
            logger.warn({ err }, 'monitor: cycle error (non-fatal)');
        }
    }, MONITOR_INTERVAL_MS);
}
//# sourceMappingURL=monitor.js.map