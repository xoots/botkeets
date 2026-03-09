/**
 * Clarification Store
 *
 * Holds pending clarification state per JID so the agent can ask questions,
 * wait for the user's reply (or `!go`), then resume execution.
 *
 * Lifecycle:
 *   1. container-runner generates a plan with clarifications
 *   2. Questions are sent to the user; setPending() is called — execution pauses
 *   3. Next message from that JID enters container-runner
 *   4. hasPending() returns true → parseAnswers() extracts answers from the reply
 *   5. runTask() is called with answers; clearPending() is called
 *   6. If the user sends `!go` (or after TTL), we proceed with empty answers
 *
 * Persistence: an optional JSON sidecar at <logsDir>/clarification-pending.json
 * is written on every mutation so state survives process restarts.
 */
import { PlanResult } from './project-planner.js';
import { ExecutionMode } from './task-runner.js';
export interface PendingClarification {
    jid: string;
    planResult: PlanResult;
    execMode: ExecutionMode;
    /** Vault key names only (never secret values). */
    vaultKeys: string[];
    createdAt: number;
    /** Discriminant: 'clarification' (default) or 'plan_approval' */
    type?: 'clarification' | 'plan_approval';
    /** Enable drip-feed micro-task orchestration for this task */
    dripFeed?: boolean;
    /** Disable drip-feed auto-activation for this task */
    noDrip?: boolean;
    /** Override to plan mode (skip auto-execute) */
    planMode?: boolean;
    /** Override max parallel container count (1–3) */
    parallelOverride?: 1 | 2 | 3;
    /** User-selected models from the !plan inline keyboard */
    planSelections?: {
        orchestrator: string;
        worker: string;
        budgetCap?: number;
    };
    /** Routing mode active when the plan was created — used to rebuild context on resume */
    effectiveMode?: 'eco' | 'standard' | 'pro';
}
/** Store a pending clarification for a JID and pause execution. */
export declare function setPending(jid: string, entry: Omit<PendingClarification, 'createdAt'>): void;
/** True if there is a live (non-expired) pending clarification for this JID. */
export declare function hasPending(jid: string): boolean;
/** Retrieve the pending clarification (returns null if expired or missing). */
export declare function getPending(jid: string): PendingClarification | null;
/** Update fields on an existing pending entry (e.g. plan UI selections). */
export declare function updatePending(jid: string, patch: Partial<Pick<PendingClarification, 'planSelections' | 'dripFeed' | 'noDrip' | 'parallelOverride'>>): void;
/** Remove the pending clarification (call after execution resumes). */
export declare function clearPending(jid: string): void;
/**
 * Extract clarification answers from the user's reply message.
 *
 * Tries two formats in order:
 *   1. "id: answer" — one per line (explicit)
 *   2. Free-form — maps each answer line to questions in order
 *
 * `!go` with no content → returns empty answers (use plan defaults).
 */
export declare function parseAnswers(userText: string, pending: PendingClarification): Record<string, string>;
//# sourceMappingURL=clarification-store.d.ts.map