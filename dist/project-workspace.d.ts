/**
 * Project Workspace Manager
 *
 * Creates and manages isolated per-task project directories on disk.
 * Each task gets a workspace like:
 *
 *   <projectRoot>/projects/2026-03-01-headless-spotify/
 *     workspace/      ← agent writes files here (git-inited)
 *     output/         ← final deliverables copied here
 *     vault.env       ← user-placed credentials (read-once, never logged)
 *     task.md         ← original task description
 *     progress.log    ← running progress notes
 *
 * The workspace/ directory is mounted into containers so the Claude Code agent
 * can read/write files natively without any path translation.
 *
 * Credential vault:
 *   User drops `vault.env` before starting the task. The agent reads it once
 *   at startup and passes creds as container env vars. The vault file itself
 *   is never logged, stored in state, or sent to any external service.
 */
export interface ProjectWorkspace {
    id: string;
    namespace?: string;
    dir: string;
    workspaceDir: string;
    outputDir: string;
    taskFile: string;
    progressFile: string;
    vaultFile: string;
}
/**
 * Create a new project workspace for a task.
 *
 * @param taskDescription  The raw task prompt (used to generate the slug)
 * @returns                ProjectWorkspace with all paths ready to use
 */
export declare function createProject(taskDescription: string, opts?: {
    namespace?: string;
}): ProjectWorkspace;
/**
 * Load an existing project workspace by ID (or full directory path).
 * Returns null if not found.
 */
export declare function loadProject(idOrPath: string, opts?: {
    namespace?: string;
}): ProjectWorkspace | null;
/**
 * List all project IDs, newest first.
 */
export declare function listProjects(opts?: {
    namespace?: string;
}): string[];
/**
 * Append a progress note to the project's progress.log.
 */
export declare function appendProgress(workspace: ProjectWorkspace, note: string): void;
/**
 * Read the vault.env file and parse it into key-value pairs.
 * Returns an empty object if the file doesn't exist.
 * IMPORTANT: Never log, persist, or transmit these values.
 */
export declare function readVault(workspace: ProjectWorkspace): Record<string, string>;
/**
 * Copy a file from the workspace into the output directory.
 * Used when the agent signals a deliverable is ready.
 */
export declare function publishOutput(workspace: ProjectWorkspace, srcPath: string): string;
//# sourceMappingURL=project-workspace.d.ts.map