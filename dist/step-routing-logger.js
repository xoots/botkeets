import fs from 'fs';
import path from 'path';
const PROJECT_ROOT = process.cwd();
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
function getLogPath(date) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return path.join(LOGS_DIR, `step-routing-${d}.jsonl`);
}
export function logStepRoutingDecision(entry) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
        const full = {
            ts: new Date().toISOString(),
            ...entry,
        };
        fs.appendFileSync(getLogPath(), JSON.stringify(full) + '\n', 'utf-8');
    }
    catch {
        // Non-fatal logging path
    }
}
function parseLogFile(logPath) {
    try {
        const raw = fs.readFileSync(logPath, 'utf-8');
        return raw
            .trim()
            .split('\n')
            .filter(Boolean)
            .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            }
            catch {
                return [];
            }
        });
    }
    catch {
        return [];
    }
}
export function readRecentStepRoutingLogs(days = 7) {
    const entries = [];
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        entries.push(...parseLogFile(getLogPath(d.toISOString().slice(0, 10))));
    }
    return entries;
}
export function aggregateStepRouting(entries) {
    const stats = {
        totalSteps: 0,
        escalatedSteps: 0,
        byProvider: {},
        byModel: {},
        byRisk: {},
        byLane: {},
    };
    for (const e of entries) {
        stats.totalSteps += 1;
        if (e.is_escalated)
            stats.escalatedSteps += 1;
        stats.byProvider[e.provider] = (stats.byProvider[e.provider] ?? 0) + 1;
        stats.byModel[e.model] = (stats.byModel[e.model] ?? 0) + 1;
        stats.byRisk[e.risk_level] = (stats.byRisk[e.risk_level] ?? 0) + 1;
        stats.byLane[e.lane_used ?? 'keet_execution'] = (stats.byLane[e.lane_used ?? 'keet_execution'] ?? 0) + 1;
    }
    return stats;
}
//# sourceMappingURL=step-routing-logger.js.map