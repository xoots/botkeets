export function splitShardText(text) {
    const normalized = text.trim();
    if (normalized.length < 120)
        return null;
    const bySentence = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (bySentence.length >= 2) {
        const mid = Math.floor(bySentence.length / 2);
        const left = bySentence.slice(0, mid).join(' ').trim();
        const right = bySentence.slice(mid).join(' ').trim();
        if (left && right)
            return [left, right];
    }
    const words = normalized.split(/\s+/);
    if (words.length < 8)
        return null;
    const mid = Math.floor(words.length / 2);
    const left = words.slice(0, mid).join(' ').trim();
    const right = words.slice(mid).join(' ').trim();
    if (!left || !right)
        return null;
    return [left, right];
}
export function initialShard(stepNumber, text) {
    return { id: `${stepNumber}-0`, text, depth: 0, index: 1, total: 1 };
}
export function applyShardOutcome(args) {
    const { queue, shard, rawOutput, maxRecursiveSplits } = args;
    const trimmed = rawOutput.trim();
    if (trimmed.startsWith('STEP_FAILED: CONTEXT_HARD_STOP_EXCEEDED')) {
        if (shard.depth >= maxRecursiveSplits) {
            return {
                nextQueue: queue,
                terminalError: `Hard-stop persisted after ${maxRecursiveSplits} shard splits`,
            };
        }
        const split = splitShardText(shard.text);
        if (!split) {
            return {
                nextQueue: queue,
                terminalError: 'Hard-stop hit and shard is already minimal; cannot split further',
            };
        }
        const [left, right] = split;
        const nextDepth = shard.depth + 1;
        const leftShard = {
            id: `${shard.id}L`,
            text: left,
            depth: nextDepth,
            index: shard.index * 2 - 1,
            total: shard.total * 2,
        };
        const rightShard = {
            id: `${shard.id}R`,
            text: right,
            depth: nextDepth,
            index: shard.index * 2,
            total: shard.total * 2,
        };
        return { nextQueue: [leftShard, rightShard, ...queue] };
    }
    if (trimmed.startsWith('STEP_FAILED:')) {
        return { nextQueue: queue, terminalError: trimmed };
    }
    return { nextQueue: queue, completedOutput: trimmed };
}
//# sourceMappingURL=sharding.js.map