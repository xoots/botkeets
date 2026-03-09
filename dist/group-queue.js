// Backward-compatibility shim. Queue orchestration now lives in app infra.
export { PlatformQueueService as GroupQueue } from './app-infra/queue/platform-queue-service.js';
// Per-group concurrency overrides — set by !parallel / !parallel3 override tags
const groupConcurrencyOverrides = new Map();
/**
 * Set the maximum concurrent containers for a group.
 * 1 = sequential (default), 2 = !parallel, 3 = !parallel3
 */
export function setGroupConcurrency(groupJid, max) {
    groupConcurrencyOverrides.set(groupJid, max);
}
/**
 * Get the current max concurrency for a group (defaults to 1).
 */
export function getGroupConcurrency(groupJid) {
    return groupConcurrencyOverrides.get(groupJid) ?? 1;
}
//# sourceMappingURL=group-queue.js.map