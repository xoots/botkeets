export function createQueueExecutionHandler(deps) {
    return async (groupJid) => {
        const channel = deps.discord?.ownsJid?.(groupJid)
            ? deps.discord
            : (deps.telegram ?? deps.discord);
        if (!channel) {
            throw new Error('No active channel available for queue processing');
        }
        const traceId = deps.pendingTraceIds?.get(groupJid);
        if (traceId)
            deps.pendingTraceIds.delete(groupJid);
        return deps.executeGroup(groupJid, channel, traceId);
    };
}
//# sourceMappingURL=queue-runtime-wiring.js.map