export interface RetryPolicyConfig {
    maxRetries: number;
    baseDelayMs: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
    circuitFailureThreshold?: number;
    circuitOpenMs?: number;
}
export interface RetryMetadata {
    retryCount: number;
    consecutiveFailures: number;
    nextRetryAtMs: number | null;
    circuitOpenUntilMs: number | null;
    poisonCount: number;
    lastFailureReason?: string;
}
export type RetryDecision = {
    action: 'retry';
    delayMs: number;
} | {
    action: 'circuit_open';
    delayMs: number;
} | {
    action: 'poison';
};
export declare class RetryPolicy {
    private readonly config;
    constructor(config: RetryPolicyConfig);
    createMetadata(): RetryMetadata;
    onSuccess(metadata: RetryMetadata): void;
    onFailure(metadata: RetryMetadata, nowMs: number, failureReason: string): RetryDecision;
    isCircuitOpen(metadata: RetryMetadata, nowMs: number): boolean;
    resetAfterPoison(metadata: RetryMetadata): void;
}
//# sourceMappingURL=retry-policy.d.ts.map