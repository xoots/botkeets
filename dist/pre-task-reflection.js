/**
 * Pre-Task Reflection — scans signals before decomposition for adjustments.
 * Fast cached reads only (<10ms). Never makes network calls. Never throws.
 */
import { readSignals } from './memory-signal-emitter.js';
import { resolveProjectIdFromContent } from './memory-project-resolver.js';
import { logger } from './logger.js';
const WINDOW_SECONDS = 7 * 24 * 60 * 60;
const FAILURE_THRESHOLD = 3;
export function scanForAdjustments(taskContent) {
    const empty = { hints: [], add_qa_step: false, project_id: null, failure_count_7d: 0, success_count_7d: 0 };
    try {
        const projectId = resolveProjectIdFromContent(taskContent);
        if (!projectId)
            return empty;
        const allSignals = readSignals(projectId);
        const now = Math.floor(Date.now() / 1000);
        const recentSignals = allSignals.filter(s => s.ts_unix >= now - WINDOW_SECONDS);
        const failures = recentSignals.filter(s => s.signal_type === 'step_failure');
        const successes = recentSignals.filter(s => s.signal_type === 'step_execution' || s.signal_type === 'task_completion');
        const hints = [];
        let addQa = false;
        if (failures.length >= FAILURE_THRESHOLD) {
            hints.push(`WARNING: ${failures.length} step failures in last 7 days. Add explicit validation/QA steps.`);
            addQa = true;
        }
        if (successes.length > 0 && failures.length === 0) {
            hints.push('Project completing tasks successfully. Follow established conventions.');
        }
        const failureRatio = recentSignals.length > 0 ? failures.length / recentSignals.length : 0;
        if (failureRatio > 0.5 && recentSignals.length >= 4) {
            hints.push('High failure rate. Break steps smaller, add error handling.');
        }
        return { hints, add_qa_step: addQa, project_id: projectId, failure_count_7d: failures.length, success_count_7d: successes.length };
    }
    catch (err) {
        logger.debug({ err }, 'pre-task-reflection: scan failed — returning empty');
        return empty;
    }
}
export function formatAdjustmentHints(adjustment) {
    if (adjustment.hints.length === 0)
        return '';
    return `\n<decomposition_hints>\n${adjustment.hints.join('\n')}\n</decomposition_hints>`;
}
//# sourceMappingURL=pre-task-reflection.js.map