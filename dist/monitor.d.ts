/**
 * Monitor Loop
 *
 * Runs every 10 minutes and closes the feedback loop between agent execution
 * and the human. Responsibilities:
 *
 *   1. PR-open tasks  — poll `gh pr checks` for CI status.
 *                       On green: notify via Telegram/Discord + mark ci_passed.
 *                       On red:   send a warning with the PR link.
 *
 *   2. Stale tasks    — warn if a task has been "running" for > 40 min.
 *                       This catches hung containers before the user notices.
 *
 *   3. Prune          — remove registry entries older than 7 days once per cycle.
 *
 * This module is purely additive — it never touches task execution and all
 * failures are caught and logged without crashing the main loop.
 */
import { Channel } from './types.js';
import type { PlatformQueueService } from './app-infra/queue/platform-queue-service.js';
/**
 * Start the monitoring loop. Call once from index.ts after channels connect.
 * Errors inside cycles are caught and logged — the loop never crashes.
 */
export declare function startMonitorLoop(channel: Channel, _queue?: PlatformQueueService): void;
//# sourceMappingURL=monitor.d.ts.map