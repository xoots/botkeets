import type { ShardPlanResult, WorkShard } from './contracts.js';
export declare function splitShardText(text: string): [string, string] | null;
export declare function initialShard(stepNumber: number, text: string): WorkShard;
export declare function applyShardOutcome(args: {
    queue: WorkShard[];
    shard: WorkShard;
    rawOutput: string;
    maxRecursiveSplits: number;
}): ShardPlanResult;
//# sourceMappingURL=sharding.d.ts.map