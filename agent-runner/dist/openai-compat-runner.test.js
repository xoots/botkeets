import { describe, expect, it, vi } from 'vitest';
import { runValidatedBashCommand } from './bash-executor.js';
describe('runValidatedBashCommand', () => {
    it('returns POLICY_BLOCKED before executing a dangerous command', () => {
        const exec = vi.fn();
        const result = runValidatedBashCommand('rm -rf /workspace/group', {}, '/workspace/group', exec);
        expect(result).toBe('POLICY_BLOCKED: destructive deletion of protected workspace mounts is not allowed');
        expect(exec).not.toHaveBeenCalled();
    });
    it('executes allowed bash commands with the provided cwd and env', () => {
        const exec = vi.fn().mockReturnValue('ok');
        const result = runValidatedBashCommand('pwd', { SAFE_ENV: '1' }, '/workspace/group', exec);
        expect(result).toBe('ok');
        expect(exec).toHaveBeenCalledWith('pwd', expect.objectContaining({
            cwd: '/workspace/group',
            env: { SAFE_ENV: '1' },
            timeout: 30_000,
        }));
    });
});
