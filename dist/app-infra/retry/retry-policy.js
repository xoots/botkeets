const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_MAX_DELAY_MS = 5 * 60_000;
const DEFAULT_CIRCUIT_OPEN_MS = 60_000;
export class RetryPolicy {
    config;
    constructor(config) {
        this.config = config;
    }
    createMetadata() {
        return {
            retryCount: 0,
            consecutiveFailures: 0,
            nextRetryAtMs: null,
            circuitOpenUntilMs: null,
            poisonCount: 0,
            lastFailureReason: undefined,
        };
    }
    onSuccess(metadata) {
        metadata.retryCount = 0;
        metadata.consecutiveFailures = 0;
        metadata.nextRetryAtMs = null;
        metadata.circuitOpenUntilMs = null;
        metadata.lastFailureReason = undefined;
    }
    onFailure(metadata, nowMs, failureReason) {
        metadata.retryCount += 1;
        metadata.consecutiveFailures += 1;
        metadata.lastFailureReason = failureReason;
        if (metadata.retryCount > this.config.maxRetries) {
            metadata.poisonCount += 1;
            metadata.nextRetryAtMs = null;
            return { action: 'poison' };
        }
        const circuitThreshold = this.config.circuitFailureThreshold ?? 0;
        if (circuitThreshold > 0 && metadata.consecutiveFailures >= circuitThreshold) {
            const openMs = Math.max(0, this.config.circuitOpenMs ?? DEFAULT_CIRCUIT_OPEN_MS);
            metadata.circuitOpenUntilMs = nowMs + openMs;
            metadata.nextRetryAtMs = metadata.circuitOpenUntilMs;
            return { action: 'circuit_open', delayMs: openMs };
        }
        const backoffMultiplier = this.config.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
        const rawDelay = this.config.baseDelayMs * Math.pow(backoffMultiplier, metadata.retryCount - 1);
        const maxDelayMs = this.config.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
        const delayMs = Math.min(maxDelayMs, rawDelay);
        metadata.nextRetryAtMs = nowMs + delayMs;
        return { action: 'retry', delayMs };
    }
    isCircuitOpen(metadata, nowMs) {
        return (metadata.circuitOpenUntilMs ?? 0) > nowMs;
    }
    resetAfterPoison(metadata) {
        metadata.retryCount = 0;
        metadata.consecutiveFailures = 0;
        metadata.nextRetryAtMs = null;
        metadata.circuitOpenUntilMs = null;
    }
}
//# sourceMappingURL=retry-policy.js.map