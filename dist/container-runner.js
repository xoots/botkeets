import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CLAUDE_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, CONTAINER_IMAGE, CONTAINER_MAX_OUTPUT_SIZE, CONTAINER_RUNTIME_BIN, CONTAINER_TIMEOUT, DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DISCORD_BOT_TOKEN, DISCORD_ONLY, DISCORD_TOKEN_ALIAS_USED, KEET_DEPLOYMENT_PROFILE, KEET_FULL_EXECUTION_ENABLED, KEET_REQUIRE_AGENT_IMAGE, KEET_REQUIRE_CLASSIFIER_SIDECAR, KEET_REQUIRE_CONTAINER_RUNTIME, OLLAMA_HOST, OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN, } from './config.js';
import { logger, childLogger } from './logger.js';
import { state, saveState } from './state-manager.js';
import { containerRuntime } from './container-runtime-manager.js';
import { enterProjectPlanMode, PLANNER_DEFAULTS } from './project-planner.js';
import { readVault } from './project-workspace.js';
import { prepareMessages, checkContextBudget } from './context-manager.js';
import { resolveEffectiveOllamaModel, resolveEffectiveProviderCredential } from './keet-provider-config.js';
import { runnerToScriptInfo } from './runtime-resolver.js';
import { platformContextManager } from './platform-context-manager.js';
import { intakeAndClassify } from './intake-policy.js';
import { approveAndClarify } from './approval-policy.js';
import { executeAndFinalize } from './execution-lifecycle.js';
import { getEnabledMcpServersForSdk } from './copaw-system.js';
import { parseOverrides } from './override-parser.js';
import { setPending } from './clarification-store.js';
import { markMessagesProcessed } from './db.js';
import { sanitizeEnvVars } from './sanitize-env-vars.js';
import { sanitizeRuntimeMounts, sanitizeSecretEnvMap } from './runtime-security-policy.js';
import { validateSandboxMounts } from './validate-sandbox-security.js';
import { buildFixedContainerMounts } from './container-execution-contract.js';
import { resolveContainerStdout } from './container-output-contract.js';
import { getRuntimeCapabilityDecision, getRuntimeCapabilityStatusReport } from './readiness-decision.js';
const PROJECT_ROOT = process.cwd();
const SESSIONS_BASE = path.join(PROJECT_ROOT, 'sessions');
const IPC_BASE = path.join(PROJECT_ROOT, 'ipc');
const KEET_ARTIFACT_NAMESPACE = 'keet';
const PROVIDER_SECRET_ENV_KEYS = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'OPENROUTER_API_KEY',
    'DASHSCOPE_API_KEY',
    'DASHSCOPE_BASE_URL',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'OLLAMA_API_KEY',
    'OLLAMA_HOST',
];
/**
 * Harness reminder — appended to every tool result before it re-enters context.
 * Repeating constraints here achieves higher adherence than system-prompt-only
 * instructions (Claude Code architecture pattern).
 */
const HARNESS_REMINDER = `
<harness-reminder>
Routing rules (always apply):
• Classification and planning run locally — never call cloud APIs for these
• Container tasks only: bash, file edits, multi-step code work
• Direct path: social, chat, business, research queries — no container
• Structured mode default — autonomous only on !auto or escape hatch
• Never exceed the per-task call budget (MAX_TASK_CALLS)
• Output STEP_FAILED: <reason> if a step cannot be completed
</harness-reminder>`.trim();
export function formatContainerCapabilityFailureMessage(containerStatus, fullExecutionStatus) {
    const blockerLabel = containerStatus.blockers.length === 1 ? 'Missing capability' : 'Missing capabilities';
    let message = `⚠️ Keets is running in degraded mode on this host. This task requires local container execution, but the container lane is unavailable. ${blockerLabel}: ${containerStatus.detail}. Direct-path chat, research, and business flows remain available.`;
    if (fullExecutionStatus && !fullExecutionStatus.available) {
        const classifierBlockers = fullExecutionStatus.blockers.filter((blocker) => blocker.code === 'classifier_sidecar_health');
        if (classifierBlockers.length > 0) {
            message += ` Full local execution is also degraded by ${classifierBlockers.map((blocker) => `${blocker.code}: ${blocker.detail}`).join('; ')}.`;
        }
    }
    return message;
}
// ── Infrastructure helpers ────────────────────────────────────────────────────
function sharedSecrets() {
    const anthropic = resolveEffectiveProviderCredential('anthropic', CLAUDE_API_KEY || CLAUDE_CODE_OAUTH_TOKEN, 'https://api.anthropic.com');
    const openrouter = resolveEffectiveProviderCredential('openrouter', OPENROUTER_API_KEY, 'https://openrouter.ai/api/v1');
    return {
        anthropicKey: anthropic.api_key || CLAUDE_CODE_OAUTH_TOKEN,
        openrouterKey: openrouter.api_key,
    };
}
/** Resolve the group's working directory — root-level (legacy) or groups/ (new). */
function resolveGroupDir(folder) {
    const atRoot = path.join(PROJECT_ROOT, folder);
    if (fs.existsSync(atRoot))
        return atRoot;
    const inGroups = path.join(PROJECT_ROOT, 'groups', folder);
    fs.mkdirSync(inGroups, { recursive: true });
    return inGroups;
}
function resolveScopedSessionDir(groupFolder, namespace) {
    const scopedDir = path.join(SESSIONS_BASE, namespace, groupFolder, '.claude');
    const legacyDir = path.join(SESSIONS_BASE, groupFolder, '.claude');
    if (fs.existsSync(scopedDir) || !fs.existsSync(legacyDir)) {
        return scopedDir;
    }
    return legacyDir;
}
/** Ensure the .claude settings.json exists so the SDK picks up env flags. */
function ensureClaudeSettings(sessionDir) {
    const settingsPath = path.join(sessionDir, 'settings.json');
    if (fs.existsSync(settingsPath))
        return;
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
        env: {
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
            CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
        },
    }, null, 2));
}
/** Advance the group's last-processed timestamp if the new one is later. */
function updateTimestamp(groupJid, timestamp) {
    const current = state.lastAgentTimestamp[groupJid] || '';
    if (timestamp > current) {
        state.lastAgentTimestamp[groupJid] = timestamp;
        saveState();
    }
}
/**
 * Fallback container path — runs plan → approve → execute for recovery handlers.
 * Used when a failure recovery needs to promote a direct-path request into container mode.
 */
async function runFallbackContainer(groupJid, telegram, routingContext, vaultEnv, taskText, traceId) {
    const planningTaskText = routingContext.clean_content.trim() || taskText;
    // Resolve planner provider/model from effective routing mode
    const planModeKey = (routingContext?.effective_mode === 'pro' ? 'pro'
        : routingContext?.effective_mode === 'eco' ? 'eco'
            : 'standard');
    const { provider: fallbackOrchProvider, model: fallbackOrchModel } = PLANNER_DEFAULTS[planModeKey] ?? PLANNER_DEFAULTS['standard'];
    const planResult = await enterProjectPlanMode(planningTaskText, Object.keys(vaultEnv), fallbackOrchProvider, fallbackOrchModel);
    const approval = await approveAndClarify(planResult, taskText, groupJid, telegram, routingContext);
    if (approval.kind === 'paused_for_approval')
        return true;
    if (approval.kind === 'budget_blocked')
        return false;
    const outcome = await executeAndFinalize(approval.planResult, approval.execMode, groupJid, telegram, (p, jid, v, d, sid) => runContainerPrompt(p, jid, v ?? vaultEnv, d, sid), vaultEnv, routingContext, { taskSummary: taskText.slice(0, 80), traceId });
    return outcome.success;
}
// ── Container prompt execution ────────────────────────────────────────────────
/**
 * Thin wrapper so task-runner can invoke the container without circular imports.
 * Runs a focused single-step prompt through the container and returns the output text.
 * Called by task-runner's ContainerExecuteFn callback.
 */
export async function runContainerPrompt(prompt, chatJid, vaultEnv = {}, stepRoutingDecision, incomingSessionId) {
    // Check and compress prompt if approaching context budget
    const promptMsgs = await prepareMessages([{ role: 'user', content: prompt }], 'claude-sonnet');
    const safePrompt = promptMsgs.map(m => m.content).join('\n');
    const postBudget = checkContextBudget([{ role: 'user', content: safePrompt }], 'claude-sonnet');
    if (postBudget.hardStopExceeded) {
        return `STEP_FAILED: CONTEXT_HARD_STOP_EXCEEDED (${(postBudget.usedPercent * 100).toFixed(1)}%)`;
    }
    return new Promise((resolve) => {
        const group = state.registeredGroups[chatJid];
        if (!group) {
            resolve('STEP_FAILED: group not registered');
            return;
        }
        const groupDir = resolveGroupDir(group.folder);
        const ipcDir = path.join(IPC_BASE, group.folder);
        const sessionDir = resolveScopedSessionDir(group.folder, KEET_ARTIFACT_NAMESPACE);
        fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
        fs.mkdirSync(ipcDir, { recursive: true });
        ensureClaudeSettings(sessionDir);
        const decisionProvider = stepRoutingDecision?.provider;
        const runner = decisionProvider === 'ollama' ? 'ollama'
            : decisionProvider === 'openrouter' ? 'openrouter'
                : decisionProvider === 'dashscope' ? 'dashscope'
                    : decisionProvider === 'deepseek' ? 'deepseek'
                        : 'claude';
        const { modelEnvVar } = runnerToScriptInfo(runner);
        const selectedModel = runner === 'ollama'
            ? resolveEffectiveOllamaModel(stepRoutingDecision?.model || process.env.OLLAMA_MODEL || 'qwen3:8b').model
            : stepRoutingDecision?.model;
        const sessionHandle = platformContextManager.leaseSessionContext({
            namespace: KEET_ARTIFACT_NAMESPACE,
            groupFolder: group.folder,
            provider: runner,
            preferredSessionId: incomingSessionId || state.sessions[group.folder]?.[runner],
        });
        const sessionId = sessionHandle.sessionId ?? undefined;
        let leaseReleased = false;
        const releaseLease = () => {
            if (!leaseReleased) {
                leaseReleased = true;
                platformContextManager.releaseSessionContext(sessionHandle.leaseId);
            }
        };
        const containerSecrets = {
            ANTHROPIC_API_KEY: sharedSecrets().anthropicKey,
            CLAUDE_CODE_OAUTH_TOKEN,
            OPENROUTER_API_KEY: sharedSecrets().openrouterKey,
            DASHSCOPE_API_KEY,
            DASHSCOPE_BASE_URL,
            DEEPSEEK_API_KEY,
            DEEPSEEK_BASE_URL,
            OLLAMA_API_KEY: 'ollama',
            OLLAMA_HOST,
            ...vaultEnv,
        };
        const containerInput = {
            prompt: safePrompt,
            sessionId,
            groupFolder: group.folder,
            chatJid,
            isMain: group.folder === 'main',
            toolPolicyMode: 'workspace-write',
            model: selectedModel,
            forceLoginMethod: runner === 'claude' ? 'claudeai' : undefined,
            secrets: {},
            mcpServers: getEnabledMcpServersForSdk(),
        };
        const sanitizedSecrets = sanitizeEnvVars(containerSecrets, {
            allowedKeys: [...PROVIDER_SECRET_ENV_KEYS, ...Object.keys(vaultEnv)],
        });
        if (sanitizedSecrets.rejectedKeys.length > 0) {
            logger.warn({
                groupJid: chatJid,
                strippedKeys: sanitizedSecrets.rejectedKeys.map((entry) => entry.key),
            }, 'Stripped disallowed container secret env keys before container launch');
        }
        containerInput.secrets = sanitizeSecretEnvMap(sanitizedSecrets.envVars);
        const mounts = buildFixedContainerMounts({
            groupDir,
            ipcDir,
            sessionDir,
            projectRoot: PROJECT_ROOT,
            globalGroupDir: resolveGroupDir('main'),
            isMain: group.folder === 'main',
        });
        const envVars = {
            AGENT_RUNNER: runner,
            USER_ID: typeof process.getuid === 'function' ? String(process.getuid()) : '501',
            GROUP_ID: typeof process.getgid === 'function' ? String(process.getgid()) : '20',
        };
        if (modelEnvVar && selectedModel)
            envVars[modelEnvVar] = selectedModel;
        const sanitizedRuntimeEnv = sanitizeEnvVars(envVars, {
            allowedKeys: ['AGENT_RUNNER', 'USER_ID', 'GROUP_ID', ...(modelEnvVar ? [modelEnvVar] : [])],
        });
        const containerName = `nanoclaw-step-${chatJid.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}`;
        const { command: cmd, args } = containerRuntime.getRunCommand(containerName, CONTAINER_IMAGE, [], validateSandboxMounts(sanitizeRuntimeMounts(mounts)), sanitizedRuntimeEnv.envVars, [], '/workspace/group', []);
        const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '';
        let stderr = '';
        const killTimer = setTimeout(() => { proc.kill('SIGTERM'); setTimeout(() => proc.kill('SIGKILL'), 5000); setTimeout(releaseLease, 15_000); }, CONTAINER_TIMEOUT);
        proc.stdin.write(JSON.stringify(containerInput));
        proc.stdin.end();
        proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('close', (code) => {
            clearTimeout(killTimer);
            const stdoutResolution = resolveContainerStdout(output);
            if (stdoutResolution.kind === 'payload') {
                const parsed = stdoutResolution.payload;
                if (parsed.newSessionId) {
                    platformContextManager.bindSessionContext(sessionHandle.leaseId, parsed.newSessionId);
                    if (!state.sessions[group.folder])
                        state.sessions[group.folder] = {};
                    state.sessions[group.folder][runner] = parsed.newSessionId;
                }
                releaseLease();
                if (parsed.status === 'error') {
                    resolve(`STEP_FAILED: ${parsed.error ?? 'container returned an error'}`);
                    return;
                }
                const result = parsed.result ?? '';
                resolve(result ? `${result}\n\n${HARNESS_REMINDER}` : HARNESS_REMINDER);
                return;
            }
            if (stdoutResolution.kind === 'plain_text') {
                releaseLease();
                resolve(stdoutResolution.text.slice(0, CONTAINER_MAX_OUTPUT_SIZE));
                return;
            }
            const trimmedStderr = stderr.trim();
            if (trimmedStderr) {
                releaseLease();
                resolve(`STEP_FAILED: no output — child stderr: ${trimmedStderr.slice(0, CONTAINER_MAX_OUTPUT_SIZE)}`);
                return;
            }
            if (typeof code === 'number' && code !== 0) {
                releaseLease();
                resolve(`STEP_FAILED: no output — exit code ${code}`);
                return;
            }
            releaseLease();
            resolve('STEP_FAILED: no output — child stderr: none');
        });
        proc.on('error', (err) => {
            clearTimeout(killTimer);
            releaseLease();
            resolve(`STEP_FAILED: ${err.message}`);
        });
    });
}
// ── Thin coordinator ──────────────────────────────────────────────────────────
export async function runContainerForGroup(groupJid, telegram, traceId) {
    const log = traceId ? childLogger(traceId) : logger;
    const group = state.registeredGroups[groupJid];
    if (!group) {
        log.warn({ groupJid }, 'runContainerForGroup: group not registered');
        return false;
    }
    const lastTs = state.lastAgentTimestamp[groupJid] || '';
    // Deferred context — populated after intake succeeds, captured by recovery handlers
    let taskText;
    let routingContext;
    let vaultEnv = {};
    const baseHandlers = {
        promoteToContainer: async () => {
            if (!taskText || !routingContext)
                return false;
            return await runFallbackContainer(groupJid, telegram, routingContext, vaultEnv, taskText, traceId);
        },
        retryWithDefault: async (_intent) => {
            // Re-run intake with no handlers to avoid recursion
            const retryIntake = await intakeAndClassify(groupJid, telegram, lastTs, (p, jid, v, d, sid) => runContainerPrompt(p, jid, v ?? {}, d, sid));
            return retryIntake.kind === 'handled_direct';
        },
        autonomousWithoutPlan: async () => {
            if (!taskText || !routingContext)
                return false;
            return await runFallbackContainer(groupJid, telegram, routingContext, vaultEnv, taskText, traceId);
        },
        escalateToUser: async (message) => {
            await telegram.sendMessage(groupJid, `⚠️ ${message}`);
        },
        pauseAndNotify: async (message) => {
            await telegram.sendMessage(groupJid, `⏸ ${message}`);
        },
        queueForRetry: async (delayMs) => {
            setTimeout(() => { }, delayMs);
        },
    };
    // Phase 1: Intake (includes pro-shard resume, classification, direct path, clarification resume)
    const intake = await intakeAndClassify(groupJid, telegram, lastTs, (p, jid, v, d, sid) => runContainerPrompt(p, jid, v ?? {}, d, sid), baseHandlers);
    if (intake.kind === 'no_messages')
        return false;
    if (intake.kind === 'recovered')
        return true;
    if (intake.kind === 'handled_direct') {
        updateTimestamp(groupJid, intake.timestamp);
        if (intake.messages?.length) {
            markMessagesProcessed(intake.messages.map((m) => ({ id: m.id, chat_jid: m.chat_jid })));
        }
        return true;
    }
    if (intake.kind === 'resumed_clarification' || intake.kind === 'resumed_pro_shard') {
        updateTimestamp(groupJid, intake.timestamp);
        return intake.result.success;
    }
    // Phase 2: Plan (intake.kind === 'needs_planning')
    const { messages, routingContext: intakeRC } = intake;
    taskText = messages.map(m => m.content).join('\n');
    routingContext = intakeRC;
    // Mark messages as processed immediately after intake so restarts don't re-execute them
    if (messages.length) {
        markMessagesProcessed(messages.map(m => ({ id: m.id, chat_jid: m.chat_jid })));
    }
    // Always advance the cursor after intake returns messages, even if planning/execution fails.
    // Without this, a persistent provider error (e.g. DashScope timeout) would cause an
    // infinite retry loop re-processing the same messages every poll cycle.
    try {
        const planningTaskText = routingContext?.clean_content?.trim() || taskText;
        // Resolve vault keys/env for container execution
        const vaultPath = path.join(resolveGroupDir(group.folder), 'vault.env');
        const tempWs = { vaultFile: vaultPath, dir: '', id: '', workspaceDir: '', outputDir: '', taskFile: '', progressFile: '' };
        vaultEnv = readVault(tempWs);
        const vaultKeys = Object.keys(vaultEnv);
        // Resolve planner provider/model from effective routing mode
        const planModeKey = (routingContext?.effective_mode === 'pro' ? 'pro'
            : routingContext?.effective_mode === 'eco' ? 'eco'
                : 'standard');
        const { provider: orchProvider, model: orchModel } = PLANNER_DEFAULTS[planModeKey] ?? PLANNER_DEFAULTS['standard'];
        const planResult = await enterProjectPlanMode(planningTaskText, vaultKeys, orchProvider, orchModel);
        if (planResult.needsContainer) {
            const readinessDecision = await getRuntimeCapabilityDecision({
                channel: {
                    discordOnly: DISCORD_ONLY,
                    telegramToken: TELEGRAM_BOT_TOKEN,
                    discordToken: DISCORD_BOT_TOKEN,
                    legacyDiscordTokenUsed: DISCORD_TOKEN_ALIAS_USED,
                },
                deployment: {
                    profile: KEET_DEPLOYMENT_PROFILE,
                    fullExecutionEnabled: KEET_FULL_EXECUTION_ENABLED,
                    containerRuntimeBin: CONTAINER_RUNTIME_BIN,
                    containerImage: CONTAINER_IMAGE,
                    requireContainerRuntime: KEET_REQUIRE_CONTAINER_RUNTIME,
                    requireAgentImage: KEET_REQUIRE_AGENT_IMAGE,
                    requireClassifierSidecar: KEET_REQUIRE_CLASSIFIER_SIDECAR,
                },
            });
            const containerStatus = getRuntimeCapabilityStatusReport(readinessDecision, 'container_execution');
            if (!containerStatus.available) {
                const fullExecutionStatus = getRuntimeCapabilityStatusReport(readinessDecision, 'full_execution');
                const failureMessage = formatContainerCapabilityFailureMessage(containerStatus, fullExecutionStatus);
                log.warn({
                    groupJid,
                    workspaceId: planResult.workspace.id,
                    blockers: containerStatus.blockers,
                }, 'Container-required task blocked by missing host capability');
                await telegram.sendMessage(groupJid, failureMessage);
                updateTimestamp(groupJid, intake.timestamp);
                return false;
            }
        }
        // ── !plan pause: show interactive UI and wait for user selections ──
        const overrides = parseOverrides(taskText);
        if (overrides.planMode && telegram.sendPlanUI) {
            const planSummary = {
                subtasks: planResult.subtasks.map(s => ({ step: s.step, description: s.description, tool: s.tool })),
                planMarkdown: planResult.planMarkdown,
                credentialKeys: planResult.credentialKeys,
                needsContainer: planResult.needsContainer,
            };
            await telegram.sendPlanUI(groupJid, planSummary);
            setPending(groupJid, {
                jid: groupJid,
                planResult,
                execMode: routingContext.inline_override === 'auto' ? 'autonomous' : 'structured',
                vaultKeys: planResult.credentialKeys,
                type: 'plan_approval',
                dripFeed: overrides.dripFeed,
                planMode: overrides.planMode,
                parallelOverride: overrides.parallelOverride,
                effectiveMode: routingContext.effective_mode,
            });
            log.info({ groupJid, workspaceId: planResult.workspace.id }, '!plan: paused for interactive plan UI');
            updateTimestamp(groupJid, intake.timestamp);
            return true;
        }
        // Phase 3: Approve
        const approval = await approveAndClarify(planResult, taskText, groupJid, telegram, routingContext);
        if (approval.kind === 'paused_for_approval') {
            updateTimestamp(groupJid, intake.timestamp);
            return true;
        }
        if (approval.kind === 'budget_blocked') {
            updateTimestamp(groupJid, intake.timestamp);
            return false;
        }
        // Phase 4: Execute
        const outcome = await executeAndFinalize(approval.planResult, approval.execMode, groupJid, telegram, (p, jid, v, d, sid) => runContainerPrompt(p, jid, v ?? vaultEnv, d, sid), vaultEnv, routingContext, {
            originalMsgId: messages[messages.length - 1]?.id ?? undefined,
            taskSummary: taskText.slice(0, 80),
            dripFeed: approval.dripFeed,
            noDrip: approval.noDrip,
            traceId,
        });
        updateTimestamp(groupJid, intake.timestamp);
        return outcome.success;
    }
    catch (err) {
        // Advance the cursor so we don't get stuck in a retry loop on persistent failures
        log.error({ groupJid, err }, 'Planning/approval/execution phase failed — advancing cursor to prevent retry loop');
        updateTimestamp(groupJid, intake.timestamp);
        return false;
    }
}
//# sourceMappingURL=container-runner.js.map