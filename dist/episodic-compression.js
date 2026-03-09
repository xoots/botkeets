/**
 * Episodic Compression — compress completed micro-task results into session summary.
 * Append-only: never deletes raw signals or replaces existing summaries.
 * Fire-and-forget: runs via setImmediate, never blocks.
 */
import { resolveProjectIdFromContent } from './memory-project-resolver.js';
import { appendCanonicalSummary } from './db.js';
import { logger } from './logger.js';
const MAX_SUMMARY_CHARS = 2000;
export function compressEpisode(taskId, results) {
    if (results.length === 0)
        return '';
    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const lines = [
        `### Session: ${taskId} (${new Date().toISOString().slice(0, 10)})`,
        `Completed: ${succeeded.length}/${results.length} steps`,
    ];
    if (succeeded.length > 0) {
        lines.push('Outcomes:');
        for (const r of succeeded)
            lines.push(`- [OK] ${r.title}: ${r.summary.slice(0, 120)}`);
    }
    if (failed.length > 0) {
        lines.push('Failures:');
        for (const r of failed)
            lines.push(`- [FAIL] ${r.title}: ${r.summary.slice(0, 80)}`);
    }
    return lines.join('\n').slice(0, MAX_SUMMARY_CHARS);
}
export function appendEpisodeToProjectMemory(taskId, taskContent, results) {
    try {
        if (results.length === 0)
            return;
        const projectId = resolveProjectIdFromContent(taskContent);
        if (!projectId)
            return;
        const sessionTag = `Session: ${taskId}`;
        const compressed = compressEpisode(taskId, results);
        if (!compressed)
            return;
        appendCanonicalSummary(projectId, sessionTag, compressed);
        logger.info({ taskId, projectId, resultCount: results.length }, 'episodic-compression: appended session summary');
    }
    catch (err) {
        logger.warn({ err, taskId }, 'episodic-compression: failed — non-fatal');
    }
}
//# sourceMappingURL=episodic-compression.js.map