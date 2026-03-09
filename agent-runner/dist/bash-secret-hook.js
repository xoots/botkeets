export function buildSecretUnsetPrefix(secretKeys) {
    const keys = [...new Set(secretKeys.filter((key) => key.trim().length > 0))].sort();
    return keys.length > 0 ? `unset ${keys.join(' ')} 2>/dev/null; ` : '';
}
export function createSanitizeBashHook(secretKeys) {
    const unsetPrefix = buildSecretUnsetPrefix(secretKeys);
    return async (input, _toolUseId, _context) => {
        const preInput = input;
        const command = preInput.tool_input?.command;
        if (!command || !unsetPrefix)
            return {};
        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                updatedInput: {
                    ...preInput.tool_input,
                    command: unsetPrefix + command,
                },
            },
        };
    };
}
