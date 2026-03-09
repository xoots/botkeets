export type EnvRejectionReason = 'not_allowed' | 'reserved' | 'invalid_value';
export interface SanitizedEnvResult {
    envVars: Record<string, string>;
    keptKeys: string[];
    rejectedKeys: Array<{
        key: string;
        reason: EnvRejectionReason;
    }>;
}
export declare function sanitizeEnvVars(envVars: Record<string, string | undefined>, options: {
    allowedKeys: Iterable<string>;
}): SanitizedEnvResult;
//# sourceMappingURL=sanitize-env-vars.d.ts.map