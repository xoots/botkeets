import fs from 'fs';
import path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { GROUPS_DIR } from './config.js';
import { loadAnchor } from './anchor-filter.js';
import { getBudgetStatus } from './budget-policy.js';
import { estimateTokens, getSessionStateFromHistory } from './context-manager.js';
import { runDirectForGroup } from './direct-runner.js';
import { initDatabase } from './db.js';
import { enterProjectPlanMode } from './project-planner.js';
import { loadState, state } from './state-manager.js';
import { classifyTask, classifyTaskReadOnly } from './task-classifier.js';
import { runTask } from './task-runner.js';
import { runContextFactory } from './factory/context-factory.js';
import { dispatchFactoryAgentTask } from './trigger/tasks.js';
import { dispatchSignalDagWorkflow, } from './trigger/dag-tasks.js';
const server = new Server({ name: 'keet-agent', version: '1.0.0' }, { capabilities: { tools: {} } });
const TOOL_DEFINITIONS = [
    {
        name: 'run_pro_task',
        description: 'Execute a task in KEET pro mode. Prefer after classify_task, and use when quality stakes are high or the task is code-heavy and should run inside KEET.',
    },
    {
        name: 'run_standard_task',
        description: 'Execute a task in KEET standard mode. Prefer after classify_task for balanced quality/cost work that should run inside KEET.',
    },
    {
        name: 'run_eco_task',
        description: 'Execute a task in KEET eco mode. Use for low-stakes work when local or cheapest execution is acceptable.',
    },
    {
        name: 'run_local_task',
        description: 'Execute a task in KEET local mode. Use only for fully offline execution with zero cloud calls and no memory injection.',
    },
    {
        name: 'health_check',
        description: 'Given no input, returns status string and available modes array. Use when verifying agent is alive before routing tasks.',
    },
    {
        name: 'get_context',
        description: 'Inspect KEET anchor and user context for a mode (eco|standard|pro|local|auto). Use before orchestration when CoPaw needs to see KEET context, not to modify it.',
    },
    {
        name: 'get_budget_status',
        description: 'Inspect remaining KEET budget per mode and whether each mode is affordable. Use before choosing run_pro_task or run_standard_task.',
    },
    {
        name: 'classify_task',
        description: 'Classify a task and return task_type, complexity, quality_stakes, and recommended_mode. Call this first when CoPaw needs to decide which KEET execution tool to use.',
    },
    {
        name: 'get_session_state',
        description: 'Inspect one KEET session by session_id. Returns context headroom, compaction count, and history metadata for UI inspection or orchestration checks.',
    },
    {
        name: 'list_sessions',
        description: 'Inspect all known KEET MCP sessions. Returns session summaries with context usage and history metadata for read-only UI inspection.',
    },
    {
        name: 'run_factory_agents',
        description: 'Regenerate KEET anchor companion files and memory/user_context docs from docs/DECISIONS.md, recent git commits, and provider-registry.ts. Uses Trigger standard task dispatch when KEET async runtime is trigger.',
    },
    {
        name: 'run_signal_dag',
        description: 'Trigger a signal DAG run in Trigger. Expects nodes[] and edges[] and returns Trigger run id for timeline views.',
    },
    {
        name: 'schema_decompose',
        description: 'Dry-run a task through the drip-feed decomposer. Returns estimated step count, token cost, routing decisions, and deterministic eligibility without executing anything.',
    },
    {
        name: 'decompose_and_drip',
        description: 'Decompose a task into micro-tasks and execute via the drip-feed pipeline. Returns step-by-step results. Set dry_run=true for cost estimation without execution.',
    },
];
const TOOL_INPUT_SCHEMA = {
    type: 'object',
    properties: {
        task: { type: 'string' },
        session_id: { type: 'string' },
    },
    required: ['task'],
};
const CONTEXT_TOOL_SCHEMA = {
    type: 'object',
    properties: {
        mode: { type: 'string', enum: ['eco', 'standard', 'pro', 'local', 'auto'] },
    },
    required: ['mode'],
};
const SESSION_STATE_SCHEMA = {
    type: 'object',
    properties: {
        session_id: { type: 'string' },
    },
    required: ['session_id'],
};
const MODE_NAMES = new Set(['eco', 'standard', 'pro', 'local', 'auto']);
function isToolMode(value) {
    return value === 'pro' || value === 'standard' || value === 'eco' || value === 'local';
}
function isAnchorMode(value) {
    return MODE_NAMES.has(value);
}
const bootState = {
    initialized: false,
    containerReady: false,
};
const DIRECT_ONLY_MODE_ERROR = 'This task requires standard or pro mode. Eco/local execution cannot handle this request.';
const DIRECT_AND_CONTAINER_UNAVAILABLE_ERROR = 'Unable to complete task: direct execution failed and container runtime is unavailable. Try rephrasing or use a simpler request.';
class CaptureChannel {
    name = 'mcp';
    messages = [];
    async connect() { }
    async sendMessage(_jid, text) {
        this.messages.push(text);
    }
    isConnected() {
        return true;
    }
    ownsJid() {
        return true;
    }
    async disconnect() { }
    async setTyping() { }
}
function normalizeMode(mode) {
    return mode === 'local' ? 'eco' : mode;
}
function sanitizeSessionPart(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return 'default';
    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    return normalized.replace(/^-+|-+$/g, '') || 'default';
}
function ensureBootstrap() {
    if (bootState.initialized)
        return;
    initDatabase();
    loadState();
    bootState.initialized = true;
}
async function ensureContainerReady() {
    if (bootState.containerReady)
        return;
    const { containerRuntime } = await import('./container-runtime-manager.js');
    containerRuntime.ensureRunning();
    bootState.containerReady = true;
}
function ensureSessionGroup(sessionId) {
    ensureBootstrap();
    const suffix = sanitizeSessionPart(sessionId);
    const chatJid = `mcp:${suffix}`;
    if (state.registeredGroups[chatJid])
        return chatJid;
    const folder = `mcp-${suffix}`;
    const group = {
        name: `MCP ${suffix}`,
        folder,
        trigger: '',
        added_at: new Date().toISOString(),
        requiresTrigger: false,
        modelProfile: 'smart',
    };
    state.registeredGroups[chatJid] = group;
    fs.mkdirSync(path.join(GROUPS_DIR, folder, 'logs'), { recursive: true });
    return chatJid;
}
function buildRoutingContext(task, mode) {
    const effectiveMode = normalizeMode(mode);
    return {
        requested_mode: effectiveMode,
        effective_mode: effectiveMode,
        source: 'inline_override',
        inline_override: effectiveMode,
        clean_content: task,
    };
}
function buildInboundMessage(chatJid, task) {
    return {
        id: `mcp-${Date.now()}`,
        chat_jid: chatJid,
        sender: 'mcp',
        sender_name: 'MCP',
        content: task,
        timestamp: new Date().toISOString(),
    };
}
function executeSimpleTextTask(task) {
    const trimmed = task.trim();
    const patterns = [
        /^(?:say|output|return|reply with|respond with)\s+(?:the word|the phrase)?\s*["']?(.+?)["']?$/i,
        /^(?:repeat|echo)\s+["']?(.+?)["']?$/i,
    ];
    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) {
            return match[1].trim().replace(/^["']|["']$/g, '');
        }
    }
    return null;
}
function formatTaskResult(taskResult, channel) {
    const outputs = taskResult.outputs.filter(Boolean);
    if (outputs.length > 0)
        return outputs.join('\n\n');
    if (channel.messages.length > 0)
        return channel.messages[channel.messages.length - 1];
    if (!taskResult.success && taskResult.budget_blocked_reason) {
        return `Task blocked: ${taskResult.budget_blocked_reason}`;
    }
    return taskResult.success ? 'Task completed.' : 'Task failed.';
}
async function executeTask(task, mode, sessionId, injectedAnchorContext, classification) {
    const chatJid = ensureSessionGroup(sessionId);
    const channel = new CaptureChannel();
    const routingContext = buildRoutingContext(task, mode);
    const inbound = buildInboundMessage(chatJid, task);
    const simpleResult = executeSimpleTextTask(task);
    if (simpleResult !== null) {
        return simpleResult;
    }
    const taskClassification = classification ?? await classifyTask(task.slice(0, 500));
    const isDirectOnlyMode = mode === 'eco' || mode === 'local';
    const directIntent = (taskClassification.task_type === 'research' ? 'business'
        : taskClassification.task_type === 'code' ? 'complex'
            : taskClassification.task_type);
    const shouldAttemptContainer = !isDirectOnlyMode
        && (taskClassification.complexity === 'high'
            || taskClassification.task_type === 'code'
            || taskClassification.task_type === 'complex');
    const directResult = await runDirectForGroup(chatJid, channel, [inbound], directIntent, routingContext, taskClassification, { allowContainerFallback: false });
    if (directResult.handled && channel.messages.length > 0) {
        return channel.messages[channel.messages.length - 1];
    }
    if (isDirectOnlyMode) {
        return DIRECT_ONLY_MODE_ERROR;
    }
    if (!shouldAttemptContainer) {
        return DIRECT_AND_CONTAINER_UNAVAILABLE_ERROR;
    }
    try {
        await ensureContainerReady();
    }
    catch (err) {
        return DIRECT_AND_CONTAINER_UNAVAILABLE_ERROR;
    }
    const plan = await enterProjectPlanMode(task, []);
    const { runContainerPrompt } = await import('./container-runner.js');
    const result = await runTask(plan, channel, chatJid, runContainerPrompt, {}, {
        injectedAnchorContext,
        mode: 'structured',
        routingContext,
        sessionId,
    });
    return formatTaskResult(result, channel);
}
function textResult(text) {
    return {
        content: [{ type: 'text', text }],
    };
}
function findSessionHistoryPath(sessionId) {
    ensureBootstrap();
    const normalized = sanitizeSessionPart(sessionId);
    const groupFolder = `mcp-${normalized}`;
    const candidateDirs = ['.openrouter-session', '.qwen-session'];
    for (const historyDir of candidateDirs) {
        const historyPath = path.join(GROUPS_DIR, groupFolder, historyDir, `history-${sessionId}.json`);
        if (fs.existsSync(historyPath))
            return historyPath;
    }
    return null;
}
function findSessionHistory(sessionId) {
    const historyPath = findSessionHistoryPath(sessionId);
    if (!historyPath) {
        return {
            historyPath: null,
            historyBackend: null,
            updatedAt: null,
        };
    }
    const stat = fs.statSync(historyPath);
    const historyBackend = path.basename(path.dirname(historyPath))
        .replace(/^\./, '')
        .replace(/-session$/, '');
    return {
        historyPath,
        historyBackend,
        updatedAt: stat.mtime.toISOString(),
    };
}
function getSessionState(sessionId) {
    const anchor = loadAnchor('standard');
    const anchorTokens = estimateTokens(anchor.anchorContent) + estimateTokens(anchor.userContext);
    const history = findSessionHistory(sessionId);
    if (!history.historyPath) {
        return {
            ...getSessionStateFromHistory(sessionId, '', anchorTokens, 'claude-sonnet'),
            history_path: null,
            history_backend: null,
            updated_at: null,
        };
    }
    return {
        ...getSessionStateFromHistory(sessionId, history.historyPath, anchorTokens, 'claude-sonnet'),
        history_path: history.historyPath,
        history_backend: history.historyBackend,
        updated_at: history.updatedAt,
    };
}
function listSessions() {
    ensureBootstrap();
    const sessions = new Map();
    if (!fs.existsSync(GROUPS_DIR)) {
        return [];
    }
    for (const groupEntry of fs.readdirSync(GROUPS_DIR, { withFileTypes: true })) {
        if (!groupEntry.isDirectory() || !groupEntry.name.startsWith('mcp-'))
            continue;
        for (const historyDir of ['.openrouter-session', '.qwen-session']) {
            const dirPath = path.join(GROUPS_DIR, groupEntry.name, historyDir);
            if (!fs.existsSync(dirPath))
                continue;
            for (const fileEntry of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (!fileEntry.isFile())
                    continue;
                if (!fileEntry.name.startsWith('history-') || !fileEntry.name.endsWith('.json'))
                    continue;
                const sessionId = fileEntry.name.slice('history-'.length, -'.json'.length);
                const snapshot = getSessionState(sessionId);
                const previous = sessions.get(sessionId);
                if (!previous) {
                    sessions.set(sessionId, snapshot);
                    continue;
                }
                const previousUpdated = previous.updated_at ?? '';
                const nextUpdated = snapshot.updated_at ?? '';
                if (nextUpdated > previousUpdated) {
                    sessions.set(sessionId, snapshot);
                }
            }
        }
    }
    return Array.from(sessions.values()).sort((left, right) => (right.updated_at ?? '').localeCompare(left.updated_at ?? ''));
}
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            ...TOOL_DEFINITIONS[0],
            inputSchema: TOOL_INPUT_SCHEMA,
        },
        {
            ...TOOL_DEFINITIONS[1],
            inputSchema: TOOL_INPUT_SCHEMA,
        },
        {
            ...TOOL_DEFINITIONS[2],
            inputSchema: TOOL_INPUT_SCHEMA,
        },
        {
            ...TOOL_DEFINITIONS[3],
            inputSchema: TOOL_INPUT_SCHEMA,
        },
        {
            ...TOOL_DEFINITIONS[4],
            inputSchema: {
                type: 'object',
                properties: {},
            },
        },
        {
            ...TOOL_DEFINITIONS[5],
            inputSchema: CONTEXT_TOOL_SCHEMA,
        },
        {
            ...TOOL_DEFINITIONS[6],
            inputSchema: {
                type: 'object',
                properties: {},
            },
        },
        {
            ...TOOL_DEFINITIONS[7],
            inputSchema: {
                type: 'object',
                properties: {
                    task: { type: 'string' },
                },
                required: ['task'],
            },
        },
        {
            ...TOOL_DEFINITIONS[8],
            inputSchema: SESSION_STATE_SCHEMA,
        },
        {
            ...TOOL_DEFINITIONS[9],
            inputSchema: {
                type: 'object',
                properties: {},
            },
        },
        {
            ...TOOL_DEFINITIONS[10],
            inputSchema: {
                type: 'object',
                properties: {
                    commit_limit: { type: 'number' },
                },
            },
        },
        {
            ...TOOL_DEFINITIONS[11],
            inputSchema: {
                type: 'object',
                properties: {
                    dag_id: { type: 'string' },
                    nodes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                kind: { type: 'string' },
                                title: { type: 'string' },
                                config: { type: 'object' },
                            },
                            required: ['id', 'kind'],
                        },
                    },
                    edges: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                from: { type: 'string' },
                                to: { type: 'string' },
                            },
                            required: ['from', 'to'],
                        },
                    },
                    metadata: { type: 'object' },
                },
                required: ['nodes', 'edges'],
            },
        },
        {
            ...TOOL_DEFINITIONS[12],
            inputSchema: {
                type: 'object',
                properties: {
                    task: { type: 'string' },
                    mode: { type: 'string', enum: ['eco', 'standard', 'pro'] },
                },
                required: ['task'],
            },
        },
        {
            ...TOOL_DEFINITIONS[13],
            inputSchema: {
                type: 'object',
                properties: {
                    task: { type: 'string' },
                    mode: { type: 'string', enum: ['eco', 'standard', 'pro'] },
                    session_id: { type: 'string' },
                    dry_run: { type: 'boolean' },
                },
                required: ['task'],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const task = typeof args?.task === 'string' ? args.task : '';
    const sessionId = typeof args?.session_id === 'string' ? args.session_id : '';
    if (name === 'health_check') {
        ensureBootstrap();
        return textResult(JSON.stringify({ status: 'ok', modes: ['pro', 'standard', 'eco', 'local'] }));
    }
    if (name === 'get_context') {
        const mode = typeof args?.mode === 'string' && isAnchorMode(args.mode) ? args.mode : 'standard';
        const anchor = loadAnchor(mode);
        return textResult(JSON.stringify({
            mode,
            anchorContent: anchor.anchorContent,
            userContext: anchor.userContext,
            tokenEstimate: anchor.totalTokens ?? null,
        }));
    }
    if (name === 'get_budget_status') {
        return textResult(JSON.stringify(getBudgetStatus()));
    }
    if (name === 'classify_task') {
        if (!task.trim()) {
            throw new Error('Tool classify_task requires a non-empty task string');
        }
        return textResult(JSON.stringify(classifyTaskReadOnly(task)));
    }
    if (name === 'get_session_state') {
        if (!sessionId.trim()) {
            throw new Error('Tool get_session_state requires a non-empty session_id string');
        }
        return textResult(JSON.stringify(getSessionState(sessionId)));
    }
    if (name === 'list_sessions') {
        return textResult(JSON.stringify(listSessions()));
    }
    if (name === 'run_factory_agents') {
        const commitLimit = typeof args?.commit_limit === 'number' && Number.isFinite(args.commit_limit)
            ? Math.max(1, Math.floor(args.commit_limit))
            : undefined;
        const asyncRuntime = (process.env.KEET_ASYNC_RUNTIME || '').trim().toLowerCase();
        if (asyncRuntime === 'trigger') {
            const dispatch = await dispatchFactoryAgentTask({
                taskId: 'factory-agents',
                commitLimit,
                metadata: {
                    source: 'mcp-server',
                },
            });
            const runLabel = dispatch.runId ? `run_id=${dispatch.runId}` : 'run accepted (no id returned)';
            return textResult(JSON.stringify({
                accepted: true,
                runtime: 'trigger',
                result: runLabel,
            }));
        }
        const summary = runContextFactory({ commitLimit });
        return textResult(JSON.stringify({
            accepted: true,
            runtime: 'local',
            summary,
        }));
    }
    if (name === 'run_signal_dag') {
        if (!Array.isArray(args?.nodes) || !Array.isArray(args?.edges)) {
            throw new Error('Tool run_signal_dag requires nodes[] and edges[] arrays');
        }
        const nodes = args.nodes.map((node) => {
            if (!node || typeof node !== 'object') {
                throw new Error('Tool run_signal_dag received an invalid node');
            }
            const typed = node;
            return {
                id: String(typed.id ?? ''),
                kind: String(typed.kind ?? ''),
                title: typeof typed.title === 'string' ? typed.title : undefined,
                config: (typed.config && typeof typed.config === 'object')
                    ? typed.config
                    : undefined,
            };
        });
        const edges = args.edges.map((edge) => {
            if (!edge || typeof edge !== 'object') {
                throw new Error('Tool run_signal_dag received an invalid edge');
            }
            const typed = edge;
            return {
                from: String(typed.from ?? ''),
                to: String(typed.to ?? ''),
            };
        });
        if (nodes.some((node) => !node.id || !node.kind)) {
            throw new Error('Tool run_signal_dag requires each node to include id and kind');
        }
        if (edges.some((edge) => !edge.from || !edge.to)) {
            throw new Error('Tool run_signal_dag requires each edge to include from and to');
        }
        const dispatch = await dispatchSignalDagWorkflow({
            dagId: typeof args?.dag_id === 'string' && args.dag_id
                ? args.dag_id
                : `signal-dag-${Date.now()}`,
            nodes,
            edges,
            metadata: (args?.metadata && typeof args.metadata === 'object')
                ? args.metadata
                : {},
        });
        const runLabel = dispatch.runId ? `run_id=${dispatch.runId}` : 'run accepted (no id returned)';
        return textResult(JSON.stringify({
            accepted: true,
            runtime: 'trigger',
            result: runLabel,
            run_id: dispatch.runId,
        }));
    }
    if (name === 'schema_decompose') {
        if (!task.trim())
            throw new Error('Tool schema_decompose requires a non-empty task string');
        const { dryRunDripFeed } = await import('./drip-feed-dry-run.js');
        const plan = await enterProjectPlanMode(task, []);
        const mode = typeof args?.mode === 'string' && isToolMode(args.mode) ? args.mode : 'standard';
        const routingContext = buildRoutingContext(task, mode);
        const report = dryRunDripFeed(plan, routingContext);
        return textResult(JSON.stringify(report, null, 2));
    }
    if (name === 'decompose_and_drip') {
        if (!task.trim())
            throw new Error('Tool decompose_and_drip requires a non-empty task string');
        const mode = typeof args?.mode === 'string' && isToolMode(args.mode) ? args.mode : 'standard';
        const plan = await enterProjectPlanMode(task, []);
        const routingContext = buildRoutingContext(task, mode);
        if (args?.dry_run === true) {
            const { dryRunDripFeed } = await import('./drip-feed-dry-run.js');
            const report = dryRunDripFeed(plan, routingContext);
            return textResult(JSON.stringify(report, null, 2));
        }
        const chatJid = ensureSessionGroup(sessionId);
        const channel = new CaptureChannel();
        const ctx = loadAnchor(mode);
        const { runContainerPrompt } = await import('./container-runner.js');
        const { dripFeedExecute } = await import('./drip-feed-executor.js');
        const result = await dripFeedExecute(plan, channel, chatJid, runContainerPrompt, {
            anchorContext: ctx.anchorContent,
            sessionId,
            routingContext,
        });
        return textResult(formatTaskResult(result, channel));
    }
    const modeMap = {
        run_pro_task: 'pro',
        run_standard_task: 'standard',
        run_eco_task: 'eco',
        run_local_task: 'local',
    };
    const mode = modeMap[name];
    if (!mode) {
        throw new Error(`Unknown tool: ${name}`);
    }
    if (!task.trim()) {
        throw new Error(`Tool ${name} requires a non-empty task string`);
    }
    const ctx = loadAnchor(mode);
    const classification = await classifyTask(task.slice(0, 500));
    const result = await executeTask(task, mode, sessionId, {
        anchorContent: ctx.anchorContent,
        userContext: ctx.userContext,
    }, classification);
    return textResult(result);
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=mcp-server.js.map