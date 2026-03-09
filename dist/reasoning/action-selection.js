export function selectConstrainedStepAction(input) {
    if (input.success)
        return 'complete';
    if (input.hardStopExceeded) {
        if (input.shardSplitAvailable && input.shardDepth < input.maxShardDepth)
            return 'split_shard';
        return 'fail';
    }
    if (input.attempt > input.maxRetries) {
        if (input.escalationAvailable && !input.alreadyEscalated)
            return 'escalate';
        return 'trigger_escape_hatch';
    }
    return 'retry';
}
//# sourceMappingURL=action-selection.js.map