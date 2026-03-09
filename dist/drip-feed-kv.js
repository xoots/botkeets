/**
 * Drip-Feed Per-Role KV Store
 *
 * Per-role-per-workspace JSON key-value cache. Each role (coder, researcher, qa, deployer)
 * gets an isolated cache file inside <workspaceDir>/kv/<role>.json.
 *
 * Composite key format: kv:<project_id>:<role>
 *
 * Design goals:
 *   - Prevent cross-role context pollution (coder prompts != researcher prompts)
 *   - Keep caches small for 47%/26% compaction goals
 *   - No interference with existing file I/O (isolated directory)
 *
 * Reuses:
 *   Graceful degradation pattern — memory-session.ts (try/catch → return null/empty)
 *   Disk persistence pattern     — staging-cache.ts / task-registry.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
/** In-memory mirror: compositeKey → Record<string, KvEntry> */
const memoryStore = new Map();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Build the composite key used for in-memory lookups. */
export function compositeKey(projectId, role) {
    return `kv:${projectId}:${role}`;
}
/** Resolve the on-disk path for a role's KV file. */
function kvFilePath(workspaceDir, role) {
    return path.join(workspaceDir, 'kv', `${role}.json`);
}
/** Load a role's KV from disk into memory. Graceful degradation on failure. */
function loadFromDisk(workspaceDir, projectId, role) {
    const key = compositeKey(projectId, role);
    const cached = memoryStore.get(key);
    if (cached)
        return cached;
    try {
        const file = kvFilePath(workspaceDir, role);
        if (!fs.existsSync(file)) {
            const empty = {};
            memoryStore.set(key, empty);
            return empty;
        }
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (typeof data !== 'object' || data === null) {
            const empty = {};
            memoryStore.set(key, empty);
            return empty;
        }
        memoryStore.set(key, data);
        logger.debug({ projectId, role, entries: Object.keys(data).length }, 'drip-feed-kv: loaded from disk');
        return data;
    }
    catch (err) {
        logger.warn({ err, projectId, role }, 'drip-feed-kv: disk load failed — using empty cache');
        const empty = {};
        memoryStore.set(key, empty);
        return empty;
    }
}
/** Persist a role's KV to disk. Best-effort — never throws. */
function persistToDisk(workspaceDir, projectId, role) {
    try {
        const dir = path.join(workspaceDir, 'kv');
        fs.mkdirSync(dir, { recursive: true });
        const key = compositeKey(projectId, role);
        const data = memoryStore.get(key) ?? {};
        fs.writeFileSync(kvFilePath(workspaceDir, role), JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (err) {
        logger.warn({ err, projectId, role }, 'drip-feed-kv: persist failed');
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Get a value from the per-role KV store.
 * Returns undefined if key not found or store unavailable.
 */
export function kvGet(workspaceDir, projectId, role, key) {
    try {
        const store = loadFromDisk(workspaceDir, projectId, role);
        return store[key]?.value;
    }
    catch {
        return undefined;
    }
}
/**
 * Set a value in the per-role KV store.
 * Writes to both in-memory store and disk.
 */
export function kvSet(workspaceDir, projectId, role, key, value) {
    try {
        const store = loadFromDisk(workspaceDir, projectId, role);
        const now = Math.floor(Date.now() / 1000);
        store[key] = {
            value,
            created_at_unix: store[key]?.created_at_unix ?? now,
            updated_at_unix: now,
        };
        persistToDisk(workspaceDir, projectId, role);
    }
    catch (err) {
        logger.warn({ err, projectId, role, key }, 'drip-feed-kv: set failed');
    }
}
/**
 * Delete a key from the per-role KV store.
 * Returns true if key existed, false otherwise.
 */
export function kvDelete(workspaceDir, projectId, role, key) {
    try {
        const store = loadFromDisk(workspaceDir, projectId, role);
        if (!(key in store))
            return false;
        delete store[key];
        persistToDisk(workspaceDir, projectId, role);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * List all keys in a role's KV store.
 */
export function kvKeys(workspaceDir, projectId, role) {
    try {
        const store = loadFromDisk(workspaceDir, projectId, role);
        return Object.keys(store);
    }
    catch {
        return [];
    }
}
/**
 * Get the entry count for a role's KV store.
 */
export function kvSize(workspaceDir, projectId, role) {
    try {
        const store = loadFromDisk(workspaceDir, projectId, role);
        return Object.keys(store).length;
    }
    catch {
        return 0;
    }
}
/**
 * Clear all entries in a role's KV store.
 */
export function kvClear(workspaceDir, projectId, role) {
    try {
        const key = compositeKey(projectId, role);
        memoryStore.set(key, {});
        persistToDisk(workspaceDir, projectId, role);
    }
    catch (err) {
        logger.warn({ err, projectId, role }, 'drip-feed-kv: clear failed');
    }
}
/**
 * Clear ALL in-memory caches. Useful for testing.
 * Does not touch disk.
 */
export function kvResetMemory() {
    memoryStore.clear();
}
//# sourceMappingURL=drip-feed-kv.js.map