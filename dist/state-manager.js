import { logger } from './logger.js';
import { getAllSessions, getAllRegisteredGroups, getRouterState, setRouterState, getMessagesSince, getAllChats, } from './db.js';
import { ASSISTANT_NAME } from './config.js';
export const state = {
    lastTimestamp: '',
    sessions: {},
    registeredGroups: {},
    lastAgentTimestamp: {},
    messageLoopRunning: false,
    lastStillWorkingNotice: {},
};
export const modelPickerState = new Map();
export function loadState() {
    state.lastTimestamp = getRouterState('last_timestamp') || '';
    const agentTs = getRouterState('last_agent_timestamp');
    try {
        state.lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
    }
    catch {
        logger.warn('Corrupted last_agent_timestamp in DB, resetting');
        state.lastAgentTimestamp = {};
    }
    // sessions is now Record<groupFolder, Record<provider, sessionId>>
    state.sessions = getAllSessions();
    state.registeredGroups = getAllRegisteredGroups();
    // Hydrate modelPickerState from registered groups
    for (const [jid, group] of Object.entries(state.registeredGroups)) {
        if (group.preferredModel) {
            modelPickerState.set(jid, group.preferredModel);
        }
    }
    logger.info({ groupCount: Object.keys(state.registeredGroups).length }, 'State loaded');
}
export function saveState() {
    try {
        setRouterState('last_timestamp', state.lastTimestamp);
        setRouterState('last_agent_timestamp', JSON.stringify(state.lastAgentTimestamp));
        logger.debug('State persisted to DB');
    }
    catch (err) {
        logger.error({ err }, 'Failed to save state to DB');
    }
}
export function recoverPendingMessages(enqueueFn) {
    for (const [chatJid, group] of Object.entries(state.registeredGroups)) {
        const sinceTimestamp = state.lastAgentTimestamp[chatJid] || '';
        const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
        if (pending.length > 0) {
            logger.info({ group: group.name, pendingCount: pending.length }, 'Recovery: found unprocessed messages');
            enqueueFn(chatJid);
        }
    }
}
/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups() {
    const chats = getAllChats();
    const registeredJids = new Set(Object.keys(state.registeredGroups));
    return chats
        .filter((c) => c.jid !== '__group_sync__' && c.is_group)
        .map((c) => ({
        jid: c.jid,
        name: c.name,
        lastActivity: c.last_message_time,
        isRegistered: registeredJids.has(c.jid),
    }));
}
/** @internal - exported for testing */
export function _setRegisteredGroups(groups) {
    state.registeredGroups = groups;
}
//# sourceMappingURL=state-manager.js.map