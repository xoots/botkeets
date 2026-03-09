import fs from 'fs';
import path from 'path';
const PROJECT_ROOT = process.cwd();
const RUNS_FILE = path.join(PROJECT_ROOT, 'logs', 'copaw-runs.jsonl');
function normalizePathUsed(pathUsed) {
    return pathUsed === 'legacy' ? 'copaw' : pathUsed;
}
export function appendExecutionRunHistory(entry) {
    fs.mkdirSync(path.dirname(RUNS_FILE), { recursive: true });
    const normalized = {
        ...entry,
        path_used: normalizePathUsed(entry.path_used),
    };
    fs.appendFileSync(RUNS_FILE, JSON.stringify(normalized) + '\n', 'utf-8');
}
export function readExecutionRunHistory(limit = 50, cursor = 0) {
    try {
        const lines = fs.readFileSync(RUNS_FILE, 'utf-8').trim().split('\n').filter(Boolean);
        const parsed = lines
            .flatMap((line) => {
            try {
                const entry = JSON.parse(line);
                return [{ ...entry, path_used: normalizePathUsed(entry.path_used) }];
            }
            catch {
                return [];
            }
        })
            .reverse();
        const start = Math.max(0, cursor);
        const end = Math.min(parsed.length, start + Math.max(1, Math.min(200, limit)));
        return {
            runs: parsed.slice(start, end),
            next_cursor: end < parsed.length ? end : -1,
        };
    }
    catch {
        return { runs: [], next_cursor: -1 };
    }
}
//# sourceMappingURL=execution-run-history.js.map