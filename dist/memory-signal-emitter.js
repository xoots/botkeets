import fs from 'fs';
import path from 'path';
import { insertMemorySignal } from './db.js';
import { logger } from './logger.js';
import { sanitizeProjectId } from './hardening-schemas.js';
// Read DATA_DIR lazily inside functions so env overrides work in tests
function getSignalsDir() {
    const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
    return path.join(dataDir, 'signals');
}
export function emitSignal(projectId, signalType, weight, taskId, embeddingDistance, parentId) {
    // Hardening: sanitize projectId to prevent path traversal in JSONL filename
    const safeProjectId = sanitizeProjectId(projectId);
    if (!safeProjectId) {
        logger.warn({ projectId }, 'memory-signal: rejected invalid projectId');
        return;
    }
    projectId = safeProjectId;
    const tsUnix = Math.floor(Date.now() / 1000);
    const event = {
        ts_unix: tsUnix,
        signal_type: signalType,
        weight,
        task_id: taskId,
        embedding_distance: embeddingDistance,
        parent_id: parentId,
    };
    try {
        insertMemorySignal(projectId, tsUnix, signalType, weight, taskId, embeddingDistance, parentId);
    }
    catch (err) {
        logger.warn({ err, projectId, signalType }, 'memory-signal: DB write failed');
    }
    try {
        const dir = getSignalsDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(path.join(dir, `${projectId}.jsonl`), JSON.stringify(event) + '\n', 'utf-8');
    }
    catch (err) {
        logger.warn({ err, projectId, signalType }, 'memory-signal: JSONL write failed');
    }
}
export function readSignals(projectId) {
    const safeId = sanitizeProjectId(projectId);
    if (!safeId)
        return [];
    const filePath = path.join(getSignalsDir(), `${safeId}.jsonl`);
    if (!fs.existsSync(filePath))
        return [];
    try {
        return fs.readFileSync(filePath, 'utf-8')
            .split('\n').filter(Boolean)
            .flatMap(line => {
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
//# sourceMappingURL=memory-signal-emitter.js.map