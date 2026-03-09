import { execSync } from 'child_process';

import { validateBashCommand } from './bash-policy.js';

const BASH_TIMEOUT_MS = 30_000;

type BashExec = typeof execSync;

export function runValidatedBashCommand(
  command: string,
  env: Record<string, string | undefined>,
  cwd: string,
  exec: BashExec = execSync,
): string {
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
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return ((e.stdout ?? '') + (e.stderr ?? '')).trim() || e.message || 'Command failed';
  }
}
