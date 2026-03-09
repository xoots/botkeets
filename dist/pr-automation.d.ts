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
export interface PrResult {
    prNumber: number;
    prUrl: string;
    branch: string;
}
/**
 * Try to create a GitHub PR for a completed task workspace.
 *
 * @param workspaceDir  Absolute path to the git-inited workspace directory
 * @param branch        Feature branch name to create and push, e.g. "feat/2026-03-01-spotify"
 * @param summary       ≤80 char task description (used as PR title fallback)
 * @returns             PrResult on success, null if any precondition fails
 */
export declare function attemptPrCreation(workspaceDir: string, branch: string, summary: string): Promise<PrResult | null>;
//# sourceMappingURL=pr-automation.d.ts.map