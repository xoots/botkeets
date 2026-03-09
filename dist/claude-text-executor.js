import { CLAUDE_CODE_OAUTH_TOKEN } from './config.js';
import { logger } from './logger.js';
const CLAUDE_AGENT_SDK_MODULE = '../agent-runner/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';
const DEFAULT_TIMEOUT_MS = 30_000;
const SMOKE_TEST_TIMEOUT_MS = 15_000;
let oauthSmokeTestPromise = null;
let claudeAgentSdkLoader = async () => await import(CLAUDE_AGENT_SDK_MODULE);
export async function loadClaudeAgentSdk() {
    return await claudeAgentSdkLoader();
}
function buildClaudeTextOptions(opts) {
    return {
        cwd: opts.workspaceDir,
        systemPrompt: opts.systemPrompt,
        settings: opts.model ? { model: opts.model } : undefined,
        settingSources: opts.settingSources ?? [],
        tools: [],
        allowedTools: [],
        permissionMode: 'plan',
        forceLoginMethod: 'claudeai',
        mcpServers: {},
        env: {
            ...process.env,
            CLAUDE_CODE_OAUTH_TOKEN,
            CLAUDE_AGENT_SDK_CLIENT_APP: 'nanoclaw-lightweight/direct-text',
        },
    };
}
function normalizeClaudeAuthError(err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Error(`Claude OAuth smoke test failed. Refresh CLAUDE_CODE_OAUTH_TOKEN or run Claude login again. ${message}`);
}
async function runClaudeTextPrompt(opts) {
    const sdk = await loadClaudeAgentSdk();
    const query = sdk.query({
        prompt: opts.prompt,
        options: buildClaudeTextOptions(opts),
    });
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        query.close?.();
    }, timeoutMs);
    try {
        for await (const message of query) {
            if (message.type !== 'result')
                continue;
            if (message.subtype === 'success') {
                return (message.result || '').trim();
            }
            throw new Error(message.error || 'Claude text call failed');
        }
    }
    catch (err) {
        if (timedOut) {
            throw new Error(`Claude text call timed out after ${timeoutMs}ms`);
        }
        throw err;
    }
    finally {
        clearTimeout(timeout);
        query.close?.();
    }
    if (timedOut) {
        throw new Error(`Claude text call timed out after ${timeoutMs}ms`);
    }
    throw new Error('Claude text call produced no result');
}
async function ensureClaudeOauthSmokeTest(opts) {
    if (!CLAUDE_CODE_OAUTH_TOKEN) {
        throw new Error('CLAUDE_CODE_OAUTH_TOKEN is required for direct Claude text calls');
    }
    if (!oauthSmokeTestPromise) {
        oauthSmokeTestPromise = (async () => {
            try {
                await runClaudeTextPrompt({
                    prompt: 'Reply with OK only.',
                    systemPrompt: 'Reply with OK only.',
                    model: opts.model,
                    workspaceDir: opts.workspaceDir,
                    timeoutMs: SMOKE_TEST_TIMEOUT_MS,
                    settingSources: opts.settingSources ?? [],
                });
                logger.info({ workspaceDir: opts.workspaceDir }, 'Claude OAuth smoke test passed');
            }
            catch (err) {
                throw normalizeClaudeAuthError(err);
            }
        })();
    }
    return await oauthSmokeTestPromise;
}
export async function executeClaudeTextPrompt(opts) {
    await ensureClaudeOauthSmokeTest(opts);
    return await runClaudeTextPrompt(opts);
}
export function resetClaudeTextExecutorForTests() {
    oauthSmokeTestPromise = null;
    claudeAgentSdkLoader = async () => await import(CLAUDE_AGENT_SDK_MODULE);
}
export function setClaudeAgentSdkLoaderForTests(loader) {
    claudeAgentSdkLoader = loader;
}
//# sourceMappingURL=claude-text-executor.js.map