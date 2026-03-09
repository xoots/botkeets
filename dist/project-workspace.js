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
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from './logger.js';
const PROJECT_ROOT = process.cwd();
const PROJECTS_BASE = path.join(PROJECT_ROOT, 'projects');
// ── Helpers ────────────────────────────────────────────────────────────────────
/** Slugify a string for use in directory names */
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}
/** Format today's date as YYYY-MM-DD */
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}
function sanitizeNamespace(namespace) {
    if (!namespace || !namespace.trim())
        return null;
    const sanitized = namespace.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return sanitized || null;
}
function resolveProjectsBase(namespace) {
    const sanitized = sanitizeNamespace(namespace);
    return sanitized ? path.join(PROJECTS_BASE, sanitized) : PROJECTS_BASE;
}
// ── Core API ───────────────────────────────────────────────────────────────────
/**
 * Create a new project workspace for a task.
 *
 * @param taskDescription  The raw task prompt (used to generate the slug)
 * @returns                ProjectWorkspace with all paths ready to use
 */
export function createProject(taskDescription, opts = {}) {
    const slug = slugify(taskDescription.slice(0, 60));
    const id = `${todayStr()}-${slug}`;
    const namespace = sanitizeNamespace(opts.namespace) ?? undefined;
    const dir = path.join(resolveProjectsBase(namespace), id);
    const workspaceDir = path.join(dir, 'workspace');
    const outputDir = path.join(dir, 'output');
    const taskFile = path.join(dir, 'task.md');
    const progressFile = path.join(dir, 'progress.log');
    const vaultFile = path.join(dir, 'vault.env');
    // Create directory structure
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    // Write task description
    fs.writeFileSync(taskFile, `# Task\n\n${taskDescription}\n\nCreated: ${new Date().toISOString()}\n`, 'utf-8');
    // Initialise empty progress log
    if (!fs.existsSync(progressFile)) {
        fs.writeFileSync(progressFile, '', 'utf-8');
    }
    // Git init the workspace so the agent can commit progress
    try {
        execSync('git init -q', { cwd: workspaceDir, stdio: 'pipe' });
        execSync('git config user.email "agent@nanoclaw.local"', { cwd: workspaceDir, stdio: 'pipe' });
        execSync('git config user.name "NanoClaw Agent"', { cwd: workspaceDir, stdio: 'pipe' });
        // Create a .gitignore to exclude vault files from any accidental commits
        fs.writeFileSync(path.join(workspaceDir, '.gitignore'), '*.env\n*.key\nvault*\n', 'utf-8');
    }
    catch {
        // Git may not be available inside some containers — not fatal
    }
    const workspace = { id, namespace, dir, workspaceDir, outputDir, taskFile, progressFile, vaultFile };
    logger.info({ id, namespace, dir }, 'Project workspace created');
    return workspace;
}
/**
 * Load an existing project workspace by ID (or full directory path).
 * Returns null if not found.
 */
export function loadProject(idOrPath, opts = {}) {
    const namespace = sanitizeNamespace(opts.namespace) ?? undefined;
    const dir = idOrPath.startsWith('/')
        ? idOrPath
        : path.join(resolveProjectsBase(namespace), idOrPath);
    if (!fs.existsSync(dir)) {
        return null;
    }
    return {
        id: path.basename(dir),
        namespace,
        dir,
        workspaceDir: path.join(dir, 'workspace'),
        outputDir: path.join(dir, 'output'),
        taskFile: path.join(dir, 'task.md'),
        progressFile: path.join(dir, 'progress.log'),
        vaultFile: path.join(dir, 'vault.env'),
    };
}
/**
 * List all project IDs, newest first.
 */
export function listProjects(opts = {}) {
    const projectsBase = resolveProjectsBase(opts.namespace);
    try {
        return fs
            .readdirSync(projectsBase)
            .filter((name) => fs.statSync(path.join(projectsBase, name)).isDirectory())
            .sort()
            .reverse();
    }
    catch {
        return [];
    }
}
/**
 * Append a progress note to the project's progress.log.
 */
export function appendProgress(workspace, note) {
    const line = `[${new Date().toISOString()}] ${note}\n`;
    try {
        fs.appendFileSync(workspace.progressFile, line, 'utf-8');
    }
    catch {
        // Non-fatal
    }
}
/**
 * Read the vault.env file and parse it into key-value pairs.
 * Returns an empty object if the file doesn't exist.
 * IMPORTANT: Never log, persist, or transmit these values.
 */
export function readVault(workspace) {
    if (!fs.existsSync(workspace.vaultFile)) {
        return {};
    }
    const creds = {};
    try {
        const lines = fs.readFileSync(workspace.vaultFile, 'utf-8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1)
                continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (key)
                creds[key] = val;
        }
    }
    catch {
        // Non-fatal
    }
    logger.debug({ vaultFile: workspace.vaultFile, keys: Object.keys(creds) }, 'Vault read (values hidden)');
    return creds;
}
/**
 * Copy a file from the workspace into the output directory.
 * Used when the agent signals a deliverable is ready.
 */
export function publishOutput(workspace, srcPath) {
    const filename = path.basename(srcPath);
    const destPath = path.join(workspace.outputDir, filename);
    fs.copyFileSync(srcPath, destPath);
    logger.info({ src: srcPath, dest: destPath }, 'Output published');
    return destPath;
}
//# sourceMappingURL=project-workspace.js.map