import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { CLAUDE_CODE_OAUTH_TOKEN } from './config.js';
import { logger } from './logger.js';
import { OUTPUT_END_MARKER, resolveContainerStdout } from './container-output-contract.js';
const AGENT_RUNNER_ENTRYPOINT = path.join(process.cwd(), 'agent-runner', 'dist', 'index.js');
const DEFAULT_TIMEOUT_MS = 60_000;
export async function executeClaudeSdkPrompt(opts) {
    if (!CLAUDE_CODE_OAUTH_TOKEN) {
        throw new Error('CLAUDE_CODE_OAUTH_TOKEN is required for Claude SDK execution');
    }
    if (!fs.existsSync(AGENT_RUNNER_ENTRYPOINT)) {
        throw new Error(`Claude agent runner not built: ${AGENT_RUNNER_ENTRYPOINT}`);
    }
    const ipcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-sdk-ipc-'));
    const input = {
        prompt: opts.prompt,
        groupFolder: opts.groupFolder || 'direct',
        chatJid: opts.chatJid || 'direct:claude',
        isMain: opts.isMain === true,
        secrets: {
            CLAUDE_CODE_OAUTH_TOKEN,
        },
        toolPolicyMode: opts.toolPolicyMode || 'chat-only',
        workspaceDir: opts.workspaceDir,
        ipcDir,
        additionalDirectories: opts.additionalDirectories,
        enableBuiltInMcp: false,
        systemPrompt: opts.systemPrompt,
        model: opts.model,
        forceLoginMethod: 'claudeai',
        settingSources: opts.settingSources,
        mcpServers: {},
    };
    return await new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, [AGENT_RUNNER_ENTRYPOINT], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env,
            cwd: opts.workspaceDir,
        });
        let stdout = '';
        let stderr = '';
        let closeRequested = false;
        const requestClose = () => {
            if (closeRequested)
                return;
            closeRequested = true;
            const inputDir = path.join(ipcDir, 'input');
            try {
                fs.mkdirSync(inputDir, { recursive: true });
                fs.writeFileSync(path.join(inputDir, '_close'), '');
            }
            catch (err) {
                logger.warn({ err, ipcDir }, 'Failed to write Claude SDK close sentinel');
            }
        };
        const timeout = setTimeout(() => {
            requestClose();
            proc.kill('SIGTERM');
            setTimeout(() => proc.kill('SIGKILL'), 5_000);
        }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);
        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
            if (stdout.includes(OUTPUT_END_MARKER)) {
                requestClose();
            }
        });
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('error', (err) => {
            clearTimeout(timeout);
            requestClose();
            reject(err);
        });
        proc.on('close', (code) => {
            clearTimeout(timeout);
            requestClose();
            try {
                fs.rmSync(ipcDir, { recursive: true, force: true });
            }
            catch {
            }
            const resolvedOutput = resolveContainerStdout(stdout);
            if (resolvedOutput.kind === 'payload') {
                const { payload } = resolvedOutput;
                if (payload.status === 'error') {
                    reject(new Error(payload.error || 'Claude SDK runner returned an error'));
                    return;
                }
                if (payload.result) {
                    resolve(payload.result);
                    return;
                }
            }
            if (resolvedOutput.kind === 'plain_text' && resolvedOutput.text) {
                resolve(resolvedOutput.text);
                return;
            }
            const stderrText = stderr.trim();
            const suffix = stderrText ? `: ${stderrText}` : code !== 0 ? `: exit code ${code}` : '';
            reject(new Error(`Claude SDK runner produced no result${suffix}`));
        });
        proc.stdin.write(JSON.stringify(input));
        proc.stdin.end();
    });
}
//# sourceMappingURL=claude-sdk-executor.js.map