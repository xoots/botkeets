import { execSync } from 'child_process';
import { validateBashCommand } from './bash-policy.js';
const BASH_TIMEOUT_MS = 30_000;
export function runValidatedBashCommand(command, env, cwd, exec = execSync) {
    const decision = validateBashCommand(command);
    if (!decision.allowed) {
        return `POLICY_BLOCKED: ${decision.reason}`;
    }
    try {
        const out = exec(command, {
            encoding: 'utf-8',
            timeout: BASH_TIMEOUT_MS,
            env,
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return out || '(no output)';
    }
    catch (err) {
        const e = err;
        return ((e.stdout ?? '') + (e.stderr ?? '')).trim() || e.message || 'Command failed';
    }
}
