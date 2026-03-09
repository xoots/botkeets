import { Channel } from './types.js';
export interface QueueRoutingDeps {
    telegram: Channel | null;
    discord: (Channel & {
        ownsJid?: (jid: string) => boolean;
    }) | null;
    executeGroup: (groupJid: string, channel: Channel, traceId?: string) => Promise<boolean>;
    pendingTraceIds?: Map<string, string>;
}
export declare function createQueueExecutionHandler(deps: QueueRoutingDeps): (groupJid: string) => Promise<boolean>;
//# sourceMappingURL=queue-runtime-wiring.d.ts.map