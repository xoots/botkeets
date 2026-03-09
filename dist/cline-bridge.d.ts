/**
 * Cline Bridge
 *
 * Sentinel types and type-narrowing guards for Cline integration signals.
 * Processed in the alert-queue loop in index.ts.
 */
import { Channel } from './types.js';
export interface ClineSentinel {
    type: 'cline_sentinel';
    groupJid: string;
    taskId: string;
    ts: number;
}
export interface ContainerFallbackSentinel {
    type: 'container_fallback';
    groupJid: string;
    taskId: string;
    reason: string;
    prompt: string;
    ts: number;
}
export declare function isClineSentinel(alert: unknown): alert is ClineSentinel;
export declare function isContainerFallbackSentinel(alert: unknown): alert is ContainerFallbackSentinel;
/**
 * Handle a Cline sentinel alert — logs and notifies the target channel.
 * Stub: full Cline handshake to be implemented when Cline integration is wired.
 */
export declare function processClineSentinel(sentinel: ClineSentinel, channel: Channel, targetJid: string): Promise<void>;
//# sourceMappingURL=cline-bridge.d.ts.map