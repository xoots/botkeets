export { PlatformQueueService as GroupQueue } from './app-infra/queue/platform-queue-service.js';
export type { ActiveRouteInfo } from './app-infra/queue/contracts.js';
/**
 * Set the maximum concurrent containers for a group.
 * 1 = sequential (default), 2 = !parallel, 3 = !parallel3
 */
export declare function setGroupConcurrency(groupJid: string, max: 1 | 2 | 3): void;
/**
 * Get the current max concurrency for a group (defaults to 1).
 */
export declare function getGroupConcurrency(groupJid: string): 1 | 2 | 3;
//# sourceMappingURL=group-queue.d.ts.map