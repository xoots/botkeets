/**
 * PR Automation
 *
 * After a task completes successfully, attempts to push the workspace branch
 * and open a GitHub PR via `gh pr create --fill`.
 *
 * Gracefully no-ops when:
 *   - The workspace has no commits yet
 *   - No git remote is configured (local-only workspaces)
 *   - `gh` CLI is not available or not authenticated
 *
 * This is always non-fatal — task completion never depends on PR creation.
 * The caller decides what to do with the null return.
 */
import { spawnSync } from 'child_process';
import { logger } from './logger.js';
/**
 * Try to create a GitHub PR for a completed task workspace.
 *
 * @param workspaceDir  Absolute path to the git-inited workspace directory
 * @param branch        Feature branch name to create and push, e.g. "feat/2026-03-01-spotify"
 * @param summary       ≤80 char task description (used as PR title fallback)
 * @returns             PrResult on success, null if any precondition fails
 */
export async function attemptPrCreation(workspaceDir, branch, summary) {
    // ── Precondition 1: workspace must have at least one commit ──────────────────
    const logCheck = spawnSync('git', ['log', '--oneline', '-1'], {
        cwd: workspaceDir,
        encoding: 'utf-8',
    });
    if (logCheck.status !== 0 || !logCheck.stdout.trim()) {
        logger.debug({ workspaceDir }, 'pr-automation: no commits — skipping');
        return null;
    }
    // ── Precondition 2: a remote named "origin" must exist ───────────────────────
    const remoteCheck = spawnSync('git', ['remote', 'get-url', 'origin'], {
        cwd: workspaceDir,
        encoding: 'utf-8',
    });
    if (remoteCheck.status !== 0) {
        logger.debug({ workspaceDir }, 'pr-automation: no remote — skipping');
        return null;
    }
    // ── Create + push the feature branch ─────────────────────────────────────────
    // Checkout is non-fatal if branch already exists (-B forces reset)
    spawnSync('git', ['checkout', '-B', branch], { cwd: workspaceDir });
    const pushResult = spawnSync('git', ['push', '-u', 'origin', branch], {
        cwd: workspaceDir,
        encoding: 'utf-8',
    });
    if (pushResult.status !== 0) {
        logger.warn({ branch, stderr: pushResult.stderr?.trim() }, 'pr-automation: push failed');
        return null;
    }
    // ── Open the PR ───────────────────────────────────────────────────────────────
    // --fill uses the branch name + commit messages as title/body automatically
    const prCreate = spawnSync('gh', ['pr', 'create', '--fill', '--base', 'main', '--head', branch], { cwd: workspaceDir, encoding: 'utf-8' });
    if (prCreate.status !== 0) {
        logger.warn({ branch, stderr: prCreate.stderr?.trim() }, 'pr-automation: gh pr create failed');
        return null;
    }
    // gh pr create prints the URL on stdout: "https://github.com/owner/repo/pull/42\n"
    const prUrl = prCreate.stdout.trim();
    const match = prUrl.match(/\/pull\/(\d+)$/);
    if (!match) {
        logger.warn({ prUrl }, 'pr-automation: could not parse PR number');
        return null;
    }
    const prNumber = parseInt(match[1], 10);
    logger.info({ branch, prNumber, prUrl }, 'pr-automation: PR created');
    return { prNumber, prUrl, branch };
}
//# sourceMappingURL=pr-automation.js.map