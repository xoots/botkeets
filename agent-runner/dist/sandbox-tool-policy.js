import { getToolPolicy } from './dangerous-tools.js';
export function normalizeToolPolicyMode(mode) {
    if (mode === 'chat-only')
        return 'chat-only';
    return mode === 'safe-only' ? 'safe-only' : 'workspace-write';
}
export function evaluateToolPolicy(toolName, mode) {
    const normalizedMode = normalizeToolPolicyMode(mode);
    const policy = getToolPolicy(toolName);
    if (policy === 'blocked') {
        return {
            toolName,
            mode: normalizedMode,
            policy,
            allowed: false,
            reason: `Tool ${toolName} is blocked by sandbox policy.`,
        };
    }
    if (policy === 'approval_only' && normalizedMode !== 'workspace-write') {
        return {
            toolName,
            mode: normalizedMode,
            policy,
            allowed: false,
            reason: `Tool ${toolName} requires workspace-write policy mode.`,
        };
    }
    return {
        toolName,
        mode: normalizedMode,
        policy,
        allowed: true,
    };
}
export function filterToolsForPolicy(toolNames, mode) {
    if (normalizeToolPolicyMode(mode) === 'chat-only') {
        return [];
    }
    return toolNames.filter((toolName) => evaluateToolPolicy(toolName, mode).allowed);
}
