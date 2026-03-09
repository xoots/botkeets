import { Channel } from './types.js';
import { StepRoutingDecision } from './step-router.js';
import { type RuntimeCapabilityStatusReport } from './readiness-decision.js';
export declare function formatContainerCapabilityFailureMessage(containerStatus: RuntimeCapabilityStatusReport, fullExecutionStatus?: RuntimeCapabilityStatusReport): string;
/**
 * Thin wrapper so task-runner can invoke the container without circular imports.
 * Runs a focused single-step prompt through the container and returns the output text.
 * Called by task-runner's ContainerExecuteFn callback.
 */
export declare function runContainerPrompt(prompt: string, chatJid: string, vaultEnv?: Record<string, string>, stepRoutingDecision?: StepRoutingDecision, incomingSessionId?: string): Promise<string>;
export declare function runContainerForGroup(groupJid: string, telegram: Channel, traceId?: string): Promise<boolean>;
//# sourceMappingURL=container-runner.d.ts.map