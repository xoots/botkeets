import { execSync } from 'child_process';
type BashExec = typeof execSync;
export declare function runValidatedBashCommand(command: string, env: Record<string, string | undefined>, cwd: string, exec?: BashExec): string;
export {};
