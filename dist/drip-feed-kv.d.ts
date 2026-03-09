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
export type KvRole = 'coder' | 'researcher' | 'qa' | 'deployer';
export interface KvEntry {
    value: unknown;
    created_at_unix: number;
    updated_at_unix: number;
}
/** Build the composite key used for in-memory lookups. */
export declare function compositeKey(projectId: string, role: KvRole): string;
/**
 * Get a value from the per-role KV store.
 * Returns undefined if key not found or store unavailable.
 */
export declare function kvGet(workspaceDir: string, projectId: string, role: KvRole, key: string): unknown | undefined;
/**
 * Set a value in the per-role KV store.
 * Writes to both in-memory store and disk.
 */
export declare function kvSet(workspaceDir: string, projectId: string, role: KvRole, key: string, value: unknown): void;
/**
 * Delete a key from the per-role KV store.
 * Returns true if key existed, false otherwise.
 */
export declare function kvDelete(workspaceDir: string, projectId: string, role: KvRole, key: string): boolean;
/**
 * List all keys in a role's KV store.
 */
export declare function kvKeys(workspaceDir: string, projectId: string, role: KvRole): string[];
/**
 * Get the entry count for a role's KV store.
 */
export declare function kvSize(workspaceDir: string, projectId: string, role: KvRole): number;
/**
 * Clear all entries in a role's KV store.
 */
export declare function kvClear(workspaceDir: string, projectId: string, role: KvRole): void;
/**
 * Clear ALL in-memory caches. Useful for testing.
 * Does not touch disk.
 */
export declare function kvResetMemory(): void;
//# sourceMappingURL=drip-feed-kv.d.ts.map