import type { MicroTask, ExecutionHint } from './memory-types.js';
export declare function inferExecutionHint(description: string): ExecutionHint;
export declare function tryDeterministicExecution(micro: MicroTask, workspaceDir?: string): Promise<string | null>;
//# sourceMappingURL=deterministic-executor.d.ts.map