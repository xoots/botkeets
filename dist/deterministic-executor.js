/**
 * Deterministic Executor — bypasses model for known patterns.
 * Returns string on success, null on failure (caller falls back to container).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { logger } from './logger.js';
import { resolveWorkspaceBoundPath } from './runtime-security-policy.js';
const TIMEOUT_MS = 10_000;
function extractUrl(description) {
    const match = description.match(/https?:\/\/[^\s"'<>]+/i);
    return match ? match[0] : null;
}
function extractFilePath(description) {
    const match = description.match(/(?:read|cat|open|load|check)\s+(?:file\s+)?['"]?([/~][\w/.@_-]+)['"]?/i);
    return match ? match[1] : null;
}
function extractShellCommand(description) {
    // Reject anything with pipes, semicolons, or ampersands — unsafe composition
    if (/[;&|]/.test(description))
        return null;
    const safePatterns = [
        /^(?:run|execute)?\s*[`'"]*\s*(ls\b[^;&|]*)/i,
        /^(?:run|execute)?\s*[`'"]*\s*(cat\b[^;&|]*)/i,
        /^(?:run|execute)?\s*[`'"]*\s*(echo\b[^;&|]*)/i,
        /^(?:run|execute)?\s*[`'"]*\s*(pwd\b)/i,
        /^(?:run|execute)?\s*[`'"]*\s*(wc\b[^;&|]*)/i,
        /^(?:run|execute)?\s*[`'"]*\s*(head\b[^;&|]*)/i,
        /^(?:run|execute)?\s*[`'"]*\s*(tail\b[^;&|]*)/i,
    ];
    for (const pat of safePatterns) {
        const match = description.match(pat);
        if (match)
            return match[1].trim().replace(/[`'"]+$/, '');
    }
    return null;
}
function extractGitCommand(description) {
    // Reject destructive git subcommands before matching safe ones
    if (/\bgit\s+(?:push|reset|clean|force|rebase|rm|mv|commit|add|checkout)\b/i.test(description)) {
        return null;
    }
    // Reject pipes/semicolons
    if (/[;&|]/.test(description))
        return null;
    const safeGit = /\b(git\s+(?:status|log|diff|branch|remote|show|ls-files)[^;&|]*)/i;
    const match = description.match(safeGit);
    return match ? match[1].trim() : null;
}
export function inferExecutionHint(description) {
    if (extractUrl(description))
        return 'deterministic_fetch';
    if (extractFilePath(description))
        return 'deterministic_read_file';
    if (extractGitCommand(description))
        return 'deterministic_git';
    if (extractShellCommand(description))
        return 'deterministic_shell';
    return 'model_required';
}
export async function tryDeterministicExecution(micro, workspaceDir) {
    const hint = micro.execution_hint ?? inferExecutionHint(micro.description);
    if (hint === 'model_required')
        return null;
    try {
        switch (hint) {
            case 'deterministic_fetch': {
                const url = extractUrl(micro.description);
                if (!url)
                    return null;
                const { fetchPage } = await import('./web-fetch.js');
                const page = await fetchPage(url);
                return page.content.slice(0, 4000);
            }
            case 'deterministic_read_file': {
                const requestedPath = extractFilePath(micro.description);
                const filePath = requestedPath ? resolveWorkspaceBoundPath(requestedPath, workspaceDir) : null;
                if (!filePath || !fs.existsSync(filePath))
                    return null;
                return fs.readFileSync(filePath, 'utf-8').slice(0, 8000);
            }
            case 'deterministic_git': {
                const cmd = extractGitCommand(micro.description);
                if (!cmd)
                    return null;
                return execSync(cmd, {
                    cwd: workspaceDir ?? process.cwd(),
                    timeout: TIMEOUT_MS,
                    encoding: 'utf-8',
                    maxBuffer: 1024 * 1024,
                }).slice(0, 4000);
            }
            case 'deterministic_shell': {
                const cmd = extractShellCommand(micro.description);
                if (!cmd)
                    return null;
                return execSync(cmd, {
                    cwd: workspaceDir ?? process.cwd(),
                    timeout: TIMEOUT_MS,
                    encoding: 'utf-8',
                    maxBuffer: 1024 * 1024,
                }).slice(0, 4000);
            }
            default:
                return null;
        }
    }
    catch (err) {
        logger.debug({ err, microId: micro.id, hint }, 'deterministic-executor: failed — falling back to model');
        return null;
    }
}
//# sourceMappingURL=deterministic-executor.js.map