/**
 * Intake Policy
 *
 * Extracted from container-runner.ts (Sprint B).
 * Handles: pro-shard resume check → load messages → classify → direct path → clarification resume.
 * Returns an IntakeOutcome discriminated union — caller decides next step.
 */
import type { Channel, NewMessage } from './types.js';
import type { ExecutionRoutingContext } from './execution-routing.js';
import type { ClassifierResult } from './task-classifier.js';
import type { TaskRunResult, ContainerExecuteFn } from './task-runner.js';
import { type RecoveryHandlers } from './failure-taxonomy.js';
export type IntakeOutcome = {
    kind: 'no_messages';
} | {
    kind: 'handled_direct';
    timestamp: string;
} | {
    kind: 'resumed_clarification';
    result: TaskRunResult;
    timestamp: string;
} | {
    kind: 'resumed_pro_shard';
    result: TaskRunResult;
    timestamp: string;
} | {
    kind: 'needs_planning';
    messages: NewMessage[];
    classification: ClassifierResult;
    routingContext: ExecutionRoutingContext;
    timestamp: string;
} | {
    kind: 'recovered';
};
export declare function shouldAttemptDirectPath(classification: Pick<ClassifierResult, 'task_type'>): boolean;
/**
 * Intake phase: load messages, classify, attempt direct path,
 * check for pending clarification resume AND pro-shard resume.
 * Returns an IntakeOutcome discriminated union — caller decides next step.
 *
 * Note: timestamp is a string (matches state.lastAgentTimestamp storage format).
 * containerExecute must be passed to avoid circular imports with container-runner.ts.
 */
export declare function intakeAndClassify(groupJid: string, telegram: Channel, lastTimestamp: string, containerExecute: ContainerExecuteFn, recoveryHandlers?: RecoveryHandlers): Promise<IntakeOutcome>;
//# sourceMappingURL=intake-policy.d.ts.map