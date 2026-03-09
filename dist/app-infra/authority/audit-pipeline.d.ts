import { AuthorityAction, AuthorityActor, AuthorityDecisionReason } from './contracts.js';
export interface AuthorityAuditEvent {
    ts: string;
    actor: AuthorityActor;
    action: AuthorityAction;
    target: string;
    allowed: boolean;
    reason: AuthorityDecisionReason;
    details?: Record<string, unknown>;
    prev_hash: string | null;
    hash: string;
}
export declare function emitAuditDecision(event: {
    actor: AuthorityActor;
    action: AuthorityAction;
    target: string;
    allowed: boolean;
    reason: AuthorityDecisionReason;
    details?: Record<string, unknown>;
}): AuthorityAuditEvent;
export declare function readAuthorityAuditEvents(file?: string): AuthorityAuditEvent[];
export declare function validateAuthorityAuditIntegrity(file?: string): boolean;
//# sourceMappingURL=audit-pipeline.d.ts.map