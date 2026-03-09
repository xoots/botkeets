import fs from 'fs';
import path from 'path';
import { ASSISTANT_NAME, TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN, DISCORD_TOKEN_ALIAS_USED, DISCORD_ONLY, GROUPS_DIR, CONTAINER_IMAGE, IPC_POLL_INTERVAL, TRIGGER_PATTERN, CONTAINER_RUNTIME_BIN, KEET_DEPLOYMENT_PROFILE, KEET_FULL_EXECUTION_ENABLED, KEET_REQUIRE_AGENT_IMAGE, KEET_REQUIRE_CLASSIFIER_SIDECAR, KEET_REQUIRE_CONTAINER_RUNTIME, } from './config.js';
import { TelegramChannel } from './channels/telegram.js';
import { DiscordChannel } from './channels/discord.js';
import { runContainerForGroup } from './container-runner.js';
import { initDatabase, setRegisteredGroup, storeChatMetadata, storeMessage, getNewMessages, filterUnprocessedMessages } from './db.js';
import { PlatformQueueService } from './app-infra/queue/platform-queue-service.js';
import { updatePending } from './clarification-store.js';
import { logger, generateTraceId } from './logger.js';
import { containerRuntime } from './container-runtime-manager.js';
import { getRuntimeCapabilityDecision } from './readiness-decision.js';
import { getStartupReadinessAction } from './runtime-capability-helper.js';
import { setRuntimeCapabilityDecision } from './runtime-capability-store.js';
import { hasAssistantTrigger } from './execution-routing.js';
import { state, loadState, getAvailableGroups } from './state-manager.js';
import { startMonitorLoop } from './monitor.js';
import { getTasksByStatus, updateTask } from './task-registry.js';
import { startControlServer } from './control-server.js';
import { processClineSentinel, isClineSentinel, isContainerFallbackSentinel } from './cline-bridge.js';
import { createTask } from './db.js';
import { createQueueExecutionHandler } from './queue-runtime-wiring.js';
let telegram = null;
let discord = null;
const activeContainers = new Map();
const pendingTraceIds = new Map();
const queue = new PlatformQueueService();
let lastSuccessfulPollTs = 0;
export function getLoopHealthMetrics() {
    return { lastSuccessfulPollTs, consecutiveLoopFailures, messageLoopRunning: state.messageLoopRunning };
}
export { queue as _queueInstance };
async function checkQueueAlerts(channel, registeredGroups) {
    const alertDir = path.join(process.cwd(), 'ipc', '_alerts');
    if (!fs.existsSync(alertDir))
        return;
    const files = fs.readdirSync(alertDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
        const filePath = path.join(alertDir, file);
        try {
            const alert = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (alert.type === 'queue_drop') {
                const groups = registeredGroups();
                const targetJid = groups[alert.groupJid] ? alert.groupJid : Object.keys(groups)[0];
                if (targetJid) {
                    await channel.sendMessage(targetJid, `🚨 Queue alert: messages for ${alert.groupJid} were dropped after ${alert.retryCount} retries. The group may be stuck. Send a new message to reset.`);
                }
            }
            else if (isClineSentinel(alert)) {
                const groups = registeredGroups();
                const targetJid = Object.keys(groups)[0];
                if (targetJid) {
                    await processClineSentinel(alert, channel, targetJid);
                }
            }
            else if (isContainerFallbackSentinel(alert)) {
                logger.info({ taskId: alert.taskId, reason: alert.reason }, 'Container fallback triggered');
                await channel.sendMessage(alert.groupJid, `⚙️ Container fallback started for task: ${alert.taskId}`);
                // Enqueue the continuation as a scheduled task that runs immediately
                // so it goes through the normal container pipeline with coding_pro mode
                const fallbackTaskId = `fallback-${alert.taskId}-${Date.now()}`;
                createTask({
                    id: fallbackTaskId,
                    group_folder: 'main', // or extract from alert if available
                    chat_jid: alert.groupJid,
                    prompt: alert.prompt,
                    schedule_type: 'once',
                    schedule_value: 'now',
                    context_mode: 'isolated',
                    next_run: new Date().toISOString(),
                    status: 'active',
                    created_at: new Date().toISOString(),
                });
                queue.requestExecution(alert.groupJid);
            }
            else if (alert.type === 'pro_shard_approved' && alert.groupJid) {
                const taskId = alert.taskId ?? 'unknown';
                logger.info({ taskId, groupJid: alert.groupJid }, 'Pro shard approval received — resuming task');
                queue.requestExecution(alert.groupJid);
            }
            fs.unlinkSync(filePath);
        }
        catch {
            try {
                fs.unlinkSync(filePath);
            }
            catch { /* ignore */ }
        }
    }
}
function registerGroup(jid, group) {
    state.registeredGroups[jid] = group;
    setRegisteredGroup(jid, group);
    // Create group folder
    const groupDir = path.join(GROUPS_DIR, group.folder);
    fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
    logger.info({ jid, name: group.name, folder: group.folder }, 'Group registered');
}
const MAX_CONSECUTIVE_FAILURES = 10;
let consecutiveLoopFailures = 0;
function alertConsecutiveFailures(count) {
    try {
        const channel = DISCORD_ONLY ? discord : telegram;
        if (!channel)
            return;
        const firstJid = Object.keys(state.registeredGroups)[0];
        if (!firstJid)
            return;
        channel.sendMessage(firstJid, `⚠️ Message loop: ${count} consecutive DB read failures`).catch(() => { });
    }
    catch { /* best-effort, no-throw */ }
}
async function startMessageLoop() {
    if (state.messageLoopRunning) {
        logger.debug('Message loop already running, skipping duplicate start');
        return;
    }
    state.messageLoopRunning = true;
    logger.info(`NanoClaw Lightweight running (trigger: @${ASSISTANT_NAME})`);
    while (true) {
        // Phase 1: DB read — isolated so a DB failure doesn't skip routing
        let messages = [];
        try {
            const jids = Object.keys(state.registeredGroups)
                .filter((jid) => !queue.hasActiveContainer(jid));
            if (jids.length === 0) {
                await new Promise((resolve) => setTimeout(resolve, IPC_POLL_INTERVAL));
                continue;
            }
            const result = getNewMessages(jids, state.lastAgentTimestamp, ASSISTANT_NAME);
            messages = filterUnprocessedMessages(result.messages);
            consecutiveLoopFailures = 0;
            lastSuccessfulPollTs = Date.now();
        }
        catch (err) {
            consecutiveLoopFailures++;
            logger.error({ err, consecutiveFailures: consecutiveLoopFailures }, 'Error reading messages from DB');
            if (consecutiveLoopFailures >= MAX_CONSECUTIVE_FAILURES) {
                alertConsecutiveFailures(consecutiveLoopFailures);
            }
            await new Promise((resolve) => setTimeout(resolve, IPC_POLL_INTERVAL));
            continue;
        }
        // Phase 2: routing — per-group try/catch so one bad group doesn't block others
        if (messages.length > 0) {
            logger.info({ count: messages.length }, 'New messages');
            const messagesByGroup = new Map();
            for (const msg of messages) {
                const existing = messagesByGroup.get(msg.chat_jid);
                if (existing) {
                    existing.push(msg);
                }
                else {
                    messagesByGroup.set(msg.chat_jid, [msg]);
                }
            }
            for (const [chatJid, groupMessages] of messagesByGroup) {
                try {
                    const group = state.registeredGroups[chatJid];
                    if (!group)
                        continue;
                    const needsTrigger = group.folder !== 'main' && group.requiresTrigger !== false;
                    if (needsTrigger) {
                        const hasTrigger = groupMessages.some((m) => TRIGGER_PATTERN.test(m.content.trim()) || hasAssistantTrigger(m.content));
                        if (!hasTrigger)
                            continue;
                    }
                    pendingTraceIds.set(chatJid, generateTraceId());
                    queue.requestExecution(chatJid);
                }
                catch (err) {
                    logger.error({ err, chatJid }, 'Error routing messages for group');
                }
            }
        }
        await new Promise((resolve) => setTimeout(resolve, IPC_POLL_INTERVAL));
    }
}
function ensureContainerSystemRunning() {
    try {
        containerRuntime.ensureRunning();
    }
    catch (err) {
        // Container runtime is optional in lightweight mode — log and continue.
        // Tasks that require containers will fail individually; everything else starts normally.
        logger.warn({ err }, 'Container runtime unavailable — container tasks disabled');
    }
    // Skip orphan cleanup - lightweight focus
}
function handleInboundMessage(chatJid, message) {
    storeMessage(message);
    queue.requestExecution(chatJid);
}
function handleChatMetadata(chatJid, timestamp, name, channel, isGroup) {
    storeChatMetadata(chatJid, timestamp, name, channel, isGroup);
}
async function main() {
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
    setRuntimeCapabilityDecision(readinessDecision);
    const startupAction = getStartupReadinessAction(readinessDecision);
    for (const warning of readinessDecision.channel.warnings) {
        logger.warn({ warning }, 'startup preflight warning');
    }
    const degradedDeploymentCodes = new Set(readinessDecision.deployment.degraded_blockers.map((blocker) => blocker.code));
    const fatalDeploymentCodes = new Set(readinessDecision.deployment.fatal_blockers.map((blocker) => blocker.code));
    for (const check of readinessDecision.deployment.checks) {
        if (check.ok)
            continue;
        if (fatalDeploymentCodes.has(check.code)) {
            logger.error({ check }, 'startup deployment contract failed');
            continue;
        }
        if (degradedDeploymentCodes.has(check.code)) {
            logger.warn({ check }, 'startup deployment contract degraded');
            continue;
        }
        logger.warn({ check }, 'startup deployment contract warning');
    }
    logger.info({
        startup_mode: startupAction.mode,
        state: readinessDecision.state,
        bootable: readinessDecision.bootable,
        degraded: readinessDecision.degraded,
        full_execution_ready: readinessDecision.full_execution_ready,
        summary: readinessDecision.summary,
        capabilities: readinessDecision.capabilities,
    }, 'startup capability state');
    if (!startupAction.shouldBoot) {
        throw new Error(startupAction.fatalError ?? 'Startup readiness failed');
    }
    if (startupAction.degraded) {
        logger.warn({ blockers: readinessDecision.degraded_blockers, summary: readinessDecision.summary }, 'startup entering degraded mode');
    }
    startControlServer();
    ensureContainerSystemRunning();
    try {
        initDatabase();
    }
    catch (err) {
        logger.warn({ err }, 'startup: initDatabase failed, retrying once');
        try {
            initDatabase();
        }
        catch (retryErr) {
            logger.error({ err: retryErr }, 'startup: initDatabase failed on retry — cannot continue');
            process.exit(1);
        }
    }
    loadState();
    // Crash recovery: tasks still 'running' from before this boot were interrupted.
    // Mark them failed so the monitor doesn't poll them and the user can retry.
    try {
        const stale = getTasksByStatus('running');
        if (stale.length > 0) {
            logger.warn({ count: stale.length }, 'startup: marking interrupted tasks as failed');
            for (const task of stale) {
                try {
                    updateTask(task.id, { status: 'failed', completedAt: Date.now() });
                }
                catch (err) {
                    logger.error({ err, taskId: task.id }, 'startup: failed to mark task as failed');
                }
            }
        }
    }
    catch (err) {
        logger.error({ err }, 'startup: crash recovery query failed — skipping');
    }
    let isShuttingDown = false;
    const shutdown = async (signal) => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        logger.info({ signal }, 'Shutdown signal received');
        try {
            await queue.shutdown(5000);
        }
        catch (err) {
            logger.error({ err }, 'shutdown: queue cleanup failed');
        }
        try {
            if (telegram)
                await telegram.disconnect();
        }
        catch (err) {
            logger.error({ err }, 'shutdown: telegram disconnect failed');
        }
        try {
            if (discord)
                await discord.disconnect();
        }
        catch (err) {
            logger.error({ err }, 'shutdown: discord disconnect failed');
        }
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    const orchestratorDeps = { telegram: null, queue, activeContainers };
    const channelOpts = {
        onMessage: handleInboundMessage,
        onChatMetadata: handleChatMetadata,
        onModelSelected: (chatJid, model) => {
            logger.info({ chatJid, model }, 'Model selected');
        },
        onPlanConfirmed: (chatJid, selections) => {
            logger.info({ chatJid, selections }, 'Plan confirmed via UI — resuming execution');
            updatePending(chatJid, { planSelections: selections });
            queue.requestExecution(chatJid);
        },
        registeredGroups: () => state.registeredGroups,
    };
    // Connect Telegram (unless Discord-only mode)
    if (!DISCORD_ONLY) {
        telegram = new TelegramChannel(TELEGRAM_BOT_TOKEN, channelOpts);
        orchestratorDeps.telegram = telegram;
        await telegram.connect();
        const tg = telegram;
        setInterval(() => {
            checkQueueAlerts(tg, () => state.registeredGroups).catch((err) => logger.warn({ err }, 'Queue alert check failed'));
        }, 30_000);
    }
    // Connect Discord if token is set
    if (DISCORD_BOT_TOKEN) {
        discord = new DiscordChannel(DISCORD_BOT_TOKEN, channelOpts);
        await discord.connect();
        logger.info('Discord channel connected');
    }
    else {
        logger.debug('DISCORD_BOT_TOKEN not set — Discord channel disabled');
    }
    // Wire up the container runner — route to the channel that owns the JID
    queue.setExecutionHandler(createQueueExecutionHandler({
        telegram,
        discord,
        executeGroup: runContainerForGroup,
        pendingTraceIds,
    }));
    // Start task monitoring loop — polls CI status and notifies on completion.
    // Uses the primary channel (Telegram unless Discord-only).
    const primaryChannel = DISCORD_ONLY ? discord : telegram;
    if (!primaryChannel) {
        throw new Error('No primary channel available after startup');
    }
    startMonitorLoop(primaryChannel, queue);
    logger.info('Starting lightweight message loop');
    startMessageLoop();
}
main().catch((err) => { logger.error({ err }, 'Failed to start NanoClaw'); process.exit(1); });
export { getAvailableGroups };
//# sourceMappingURL=index.js.map