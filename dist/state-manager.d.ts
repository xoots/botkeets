import { RegisteredGroup } from './types.js';
export interface AppState {
    lastTimestamp: string;
    /** sessions[groupFolder][provider] = sessionId */
    sessions: Record<string, Record<string, string>>;
    registeredGroups: Record<string, RegisteredGroup>;
    lastAgentTimestamp: Record<string, string>;
    messageLoopRunning: boolean;
    lastStillWorkingNotice: Record<string, number>;
}
export declare const state: AppState;
export declare const modelPickerState: Map<string, string>;
export declare function loadState(): void;
export declare function saveState(): void;
export declare function recoverPendingMessages(enqueueFn: (jid: string) => void): void;
/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export declare function getAvailableGroups(): any[];
/** @internal - exported for testing */
export declare function _setRegisteredGroups(groups: Record<string, RegisteredGroup>): void;
//# sourceMappingURL=state-manager.d.ts.map