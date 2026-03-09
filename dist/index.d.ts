import { PlatformQueueService } from './app-infra/queue/platform-queue-service.js';
import { getAvailableGroups } from './state-manager.js';
declare const queue: PlatformQueueService;
export declare function getLoopHealthMetrics(): {
    lastSuccessfulPollTs: number;
    consecutiveLoopFailures: number;
    messageLoopRunning: boolean;
};
export { queue as _queueInstance };
export { getAvailableGroups };
//# sourceMappingURL=index.d.ts.map