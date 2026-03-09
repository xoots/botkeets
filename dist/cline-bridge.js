/**
 * Cline Bridge
 *
 * Sentinel types and type-narrowing guards for Cline integration signals.
 * Processed in the alert-queue loop in index.ts.
 */
import { logger } from './logger.js';
// ── Type guards ────────────────────────────────────────────────────────────────
export function isClineSentinel(alert) {
    return (typeof alert === 'object' &&
        alert !== null &&
        alert.type === 'cline_sentinel' &&
        typeof alert.groupJid === 'string' &&
        typeof alert.taskId === 'string');
}
export function isContainerFallbackSentinel(alert) {
    return (typeof alert === 'object' &&
        alert !== null &&
        alert.type === 'container_fallback' &&
        typeof alert.groupJid === 'string' &&
        typeof alert.taskId === 'string' &&
        typeof alert.reason === 'string' &&
        typeof alert.prompt === 'string');
}
// ── Processor ─────────────────────────────────────────────────────────────────
/**
 * Handle a Cline sentinel alert — logs and notifies the target channel.
 * Stub: full Cline handshake to be implemented when Cline integration is wired.
 */
export async function processClineSentinel(sentinel, channel, targetJid) {
    logger.info({ taskId: sentinel.taskId, groupJid: sentinel.groupJid }, 'Cline sentinel received');
    await channel.sendMessage(targetJid, `🤖 Cline agent ready for task: ${sentinel.taskId}`);
}
//# sourceMappingURL=cline-bridge.js.map