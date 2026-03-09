import { describe, expect, it } from 'vitest';

import { buildSecretUnsetPrefix, createSanitizeBashHook } from './bash-secret-hook.js';

describe('bash secret hook', () => {
  it('builds a deterministic unset prefix from container input secrets', () => {
    expect(buildSecretUnsetPrefix(['Z_KEY', 'A_KEY', 'A_KEY'])).toBe(
      'unset A_KEY Z_KEY 2>/dev/null; ',
    );
  });

  it('rewrites bash commands to unset every provided secret key', async () => {
    const hook = createSanitizeBashHook(['OPENROUTER_API_KEY', 'CUSTOM_TOKEN']);
    const result = await hook(
      { tool_input: { command: 'echo test' } } as never,
      '',
      {} as never,
    );

    expect(result).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          command: 'unset CUSTOM_TOKEN OPENROUTER_API_KEY 2>/dev/null; echo test',
        },
      },
    });
  });

  it('leaves bash commands unchanged when no secrets are present', async () => {
    const hook = createSanitizeBashHook([]);
    const result = await hook(
      { tool_input: { command: 'echo test' } } as never,
      '',
      {} as never,
    );

    expect(result).toEqual({});
  });
});
