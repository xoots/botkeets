import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

type HookCallbackArgs = Parameters<HookCallback>;

export function buildSecretUnsetPrefix(secretKeys: string[]): string {
  const keys = [...new Set(secretKeys.filter((key) => key.trim().length > 0))].sort();
  return keys.length > 0 ? `unset ${keys.join(' ')} 2>/dev/null; ` : '';
}

export function createSanitizeBashHook(secretKeys: string[]): HookCallback {
  const unsetPrefix = buildSecretUnsetPrefix(secretKeys);

  return async (
    input: HookCallbackArgs[0],
    _toolUseId: HookCallbackArgs[1],
    _context: HookCallbackArgs[2],
  ) => {
    const preInput = input as PreToolUseHookInput;
    const command = (preInput.tool_input as { command?: string })?.command;
    if (!command || !unsetPrefix) return {};

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          ...(preInput.tool_input as Record<string, unknown>),
          command: unsetPrefix + command,
        },
      },
    };
  };
}
