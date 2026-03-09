import { describe, expect, it } from 'vitest';
import { getToolPolicy } from './dangerous-tools.js';
import { evaluateToolPolicy } from './sandbox-tool-policy.js';
describe('sandbox tool policy', () => {
    it('returns expected registry decisions', () => {
        expect(getToolPolicy('Read')).toBe('safe');
        expect(getToolPolicy('Bash')).toBe('approval_only');
        expect(getToolPolicy('mcp__nanoclaw__register_group')).toBe('blocked');
    });
    it('applies policy mode gating for approval-only tools', () => {
        expect(evaluateToolPolicy('Bash', 'safe-only')).toMatchObject({
            policy: 'approval_only',
            allowed: false,
        });
        expect(evaluateToolPolicy('Bash', 'workspace-write')).toMatchObject({
            policy: 'approval_only',
            allowed: true,
        });
    });
});
