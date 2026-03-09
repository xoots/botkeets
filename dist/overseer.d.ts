import { TaskRunResult } from './task-runner.js';
export type OverseerAction = {
    action: 'complete';
} | {
    action: 'reprompt';
    newPrompt: string;
} | {
    action: 'escalate';
    reason: string;
};
export declare function evaluateResult(taskId: string, taskSummary: string, result: TaskRunResult, verificationSummary?: string): Promise<OverseerAction>;
//# sourceMappingURL=overseer.d.ts.map