/**
 * keet control server — local HTTP API for the agent-ui
 *
 * Endpoints:
 *   GET  /api/health                    — liveness probe
 *   GET  /api/services                  — pm2 status for keet + keet-classifier
 *   POST /api/mode        {mode}        — switch keet env (local | cloud)
 *   POST /api/services/:name/:action    — start | stop | restart a named service
 *
 * Listens on 127.0.0.1:${CONTROL_PORT} (default 8766)
 */
import { createServer } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { logger } from './logger.js';
import { aggregateSpend, readRecentLogs } from './routing-logger.js';
import { aggregateStepRouting, readRecentStepRoutingLogs } from './step-routing-logger.js';
import { getRuntimeSplitMetrics } from './runtime-split.js';
import { getBudgetPolicy, } from './budget-policy.js';
import { getAllTasks, getTask, getTasksByStatus } from './task-registry.js';
import { runtimeRegistry } from './runtime-registry.js';
import { getPendingProShardTask } from './pro-shard-pending-store.js';
import { getLoopHealthMetrics, _queueInstance } from './index.js';
import { CONTAINER_IMAGE, CONTAINER_RUNTIME_BIN, COPAW_BASE_URL, DISCORD_BOT_TOKEN, DISCORD_ONLY, DISCORD_TOKEN_ALIAS_USED, KEET_DEPLOYMENT_PROFILE, KEET_FULL_EXECUTION_ENABLED, KEET_CONTROL_STUB_DEPRECATED_ENDPOINTS, KEET_COPAW_MIGRATION_PHASE, KEET_REQUIRE_AGENT_IMAGE, KEET_REQUIRE_CLASSIFIER_SIDECAR, KEET_REQUIRE_CONTAINER_RUNTIME, TELEGRAM_BOT_TOKEN, } from './config.js';
import { parseControlActionRequest } from './control-action-parser.js';
import { dispatchControlAction } from './control-action-dispatcher.js';
import { readExecutionRunHistory } from './execution-run-history.js';
import { getCoPawLaneHealth } from './copaw-lane-bridge.js';
import { getInteractionCount, listInteractions } from './interaction-store.js';
import { getCoPawActiveModels, getCoPawMcpClient, getCoPawProviderDiagnostics, createCoPawMcpClient, deleteCoPawMcpClient, getCoPawWorkspaceStatus, listCoPawProviders, listCoPawSkills, getKeetMcpAdapterState as getCoPawMcpAdapterState, toggleCoPawMcpClient, updateCoPawMcpClient, } from './copaw-system.js';
import { getCoPawMigrationTelemetry, getMigrationGateStatus } from './copaw-migration.js';
import { platformAuthorityService } from './app-infra/authority/platform-authority-service.js';
import { dispatchSignalDagWorkflow } from './trigger/dag-tasks.js';
import { getRuntimeCapabilityDecision, } from './readiness-decision.js';
import { buildRuntimeCapabilityPayload } from './runtime-capability-helper.js';
import { getRuntimeCapabilityDecisionSnapshot, setRuntimeCapabilityDecision, } from './runtime-capability-store.js';
import { buildNonLiveControlRouteResponse, matchNonLiveControlRoute, } from './control-route-contract.js';
export { LIVE_CONTROL_ROUTE_CONTRACT, NON_LIVE_CONTROL_ROUTES, buildNonLiveControlRouteResponse, matchNonLiveControlRoute, } from './control-route-contract.js';
const execAsync = promisify(exec);
const CONTROL_PORT = parseInt(process.env.CONTROL_PORT ?? '8766', 10);
const UI_ORIGIN = process.env.UI_ORIGIN ?? 'http://localhost:5173';
const ADMIN_TOKEN = process.env.KEET_ADMIN_TOKEN ?? '';
const PROJECT_ROOT = process.cwd();
const MANAGED = ['keet', 'keet-classifier'];
const BODY_LIMIT_BYTES = 64 * 1024;
const BODY_TIMEOUT_MS = 5000;
const COPAW_PROXY_TIMEOUT_MS = 15_000;
const COPAW_AGENT_SESSIONS_FILE = path.join(PROJECT_ROOT, 'logs', 'copaw-agent-sessions.json');
const CORS = {
    'Access-Control-Allow-Origin': UI_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-KEET-ADMIN-TOKEN',
};
export function isAuthorizedMutatingRequest(adminToken, headerToken) {
    if (!adminToken)
        return false;
    return Boolean(headerToken && headerToken === adminToken);
}
async function pm2Status() {
    try {
        const { stdout } = await execAsync('pm2 jlist');
        const list = JSON.parse(stdout);
        return list
            .filter(p => MANAGED.includes(p.name))
            .map(p => ({
            name: p.name,
            status: p.pm2_env?.status ?? 'unknown',
            pid: p.pid ?? null,
            memory: p.monit?.memory ?? null,
        }));
    }
    catch {
        return [];
    }
}
function jsonReply(res, status, body) {
    res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        const timeout = setTimeout(() => reject(new Error('request timeout')), BODY_TIMEOUT_MS);
        req.on('data', c => {
            total += c.length;
            if (total > BODY_LIMIT_BYTES) {
                clearTimeout(timeout);
                reject(new Error('request body too large'));
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
        req.on('close', () => clearTimeout(timeout));
    });
}
function isAuthed(req) {
    const raw = req.headers['x-keet-admin-token'];
    return isAuthorizedMutatingRequest(ADMIN_TOKEN, typeof raw === 'string' ? raw : undefined);
}
function requireMutatingAuth(req, res) {
    if (!ADMIN_TOKEN) {
        jsonReply(res, 503, { error: 'Mutating control endpoints disabled: KEET_ADMIN_TOKEN is not configured' });
        return false;
    }
    if (!isAuthed(req)) {
        jsonReply(res, 401, { error: 'Unauthorized' });
        return false;
    }
    return true;
}
function parseJsonBody(rawBody) {
    try {
        return { ok: true, value: JSON.parse(rawBody) };
    }
    catch {
        return { ok: false, error: 'Invalid JSON body' };
    }
}
function getSqliteMetrics() {
    const dbPath = path.join(PROJECT_ROOT, 'store', 'messages.db');
    if (!fs.existsSync(dbPath)) {
        return {
            dbPath,
            available: false,
            messages: 0,
            registeredGroups: 0,
            scheduledTasks: 0,
            llmInteractions: 0,
        };
    }
    try {
        const db = new Database(dbPath, { readonly: true, fileMustExist: true });
        const messages = Number(db.prepare('SELECT COUNT(*) as c FROM messages').get().c || 0);
        const registeredGroups = Number(db.prepare('SELECT COUNT(*) as c FROM registered_groups').get().c || 0);
        const scheduledTasks = Number(db.prepare('SELECT COUNT(*) as c FROM scheduled_tasks').get().c || 0);
        const llmInteractionsTableRow = db
            .prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'llm_interactions'")
            .get();
        const llmInteractionsTablePresent = Number(llmInteractionsTableRow.c || 0) > 0;
        const llmInteractions = llmInteractionsTablePresent
            ? Number(db.prepare('SELECT COUNT(*) as c FROM llm_interactions').get().c || 0)
            : 0;
        db.close();
        return {
            dbPath,
            available: true,
            messages,
            registeredGroups,
            scheduledTasks,
            llmInteractions,
        };
    }
    catch {
        return {
            dbPath,
            available: false,
            messages: 0,
            registeredGroups: 0,
            scheduledTasks: 0,
            llmInteractions: 0,
        };
    }
}
function sanitizeLegacyBranding(text) {
    return text;
}
function sanitizeWarnings(warnings) {
    return warnings.map((warning) => sanitizeLegacyBranding(warning));
}
export async function isExistingControlServerHealthy(fetchImpl = fetch) {
    try {
        const response = await fetchImpl(`http://127.0.0.1:${CONTROL_PORT}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(1_000),
        });
        if (!response.ok)
            return false;
        const body = await response.json().catch(() => null);
        return Boolean(body && typeof body === 'object' && 'ok' in body && body.ok === true);
    }
    catch {
        return false;
    }
}
function sanitizeExecutionReadiness(readiness) {
    return {
        ...readiness,
        warnings: sanitizeWarnings(readiness.warnings),
        errors: sanitizeWarnings(readiness.errors),
    };
}
function readCoPawAgentSessions() {
    try {
        const raw = JSON.parse(fs.readFileSync(COPAW_AGENT_SESSIONS_FILE, 'utf-8'));
        if (!Array.isArray(raw))
            return [];
        return raw
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => {
            const obj = entry;
            return {
                session_id: String(obj.session_id || ''),
                title: String(obj.title || 'CoPaw Session'),
                created_at: String(obj.created_at || new Date().toISOString()),
                updated_at: String(obj.updated_at || new Date().toISOString()),
            };
        })
            .filter((entry) => entry.session_id);
    }
    catch {
        return [];
    }
}
function writeCoPawAgentSessions(sessions) {
    fs.mkdirSync(path.dirname(COPAW_AGENT_SESSIONS_FILE), { recursive: true });
    fs.writeFileSync(COPAW_AGENT_SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}
function upsertCoPawAgentSession(sessionId, title) {
    const now = new Date().toISOString();
    const sessions = readCoPawAgentSessions();
    const existing = sessions.find((session) => session.session_id === sessionId);
    if (existing) {
        existing.updated_at = now;
        if (typeof title === 'string' && title.trim())
            existing.title = title.trim();
        writeCoPawAgentSessions(sessions);
        return existing;
    }
    const created = {
        session_id: sessionId,
        title: title?.trim() || 'CoPaw Session',
        created_at: now,
        updated_at: now,
    };
    sessions.push(created);
    writeCoPawAgentSessions(sessions);
    return created;
}
async function callCoPawAgent(route, init) {
    try {
        const response = await fetch(`${COPAW_BASE_URL.replace(/\/$/, '')}${route}`, {
            ...init,
            signal: AbortSignal.timeout(COPAW_PROXY_TIMEOUT_MS),
        });
        const text = await response.text();
        const body = text
            ? (() => {
                try {
                    return JSON.parse(text);
                }
                catch {
                    return { raw: text };
                }
            })()
            : {};
        if (!response.ok) {
            return { ok: false, status: response.status, error: `CoPaw adapter HTTP ${response.status}` };
        }
        return { ok: true, status: response.status, body };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 502, error: `CoPaw adapter unavailable: ${message}` };
    }
}
async function handle(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
    }
    const url = req.url ?? '';
    const parsedUrl = (() => {
        try {
            return new URL(url, 'http://127.0.0.1');
        }
        catch {
            return new URL('http://127.0.0.1');
        }
    })();
    const pathname = (() => {
        try {
            return parsedUrl.pathname;
        }
        catch {
            return url;
        }
    })();
    if (KEET_CONTROL_STUB_DEPRECATED_ENDPOINTS) {
        const deprecatedRoute = matchNonLiveControlRoute(req.method, pathname);
        if (deprecatedRoute) {
            const stubResponse = buildNonLiveControlRouteResponse(deprecatedRoute, KEET_COPAW_MIGRATION_PHASE);
            jsonReply(res, stubResponse.status, stubResponse.body);
            return;
        }
    }
    if (req.method === 'GET' && url === '/api/health') {
        const loop = getLoopHealthMetrics();
        const queueMetrics = _queueInstance.getHealthMetrics();
        const stalePollSec = (Date.now() - loop.lastSuccessfulPollTs) / 1000;
        const healthy = loop.messageLoopRunning &&
            !queueMetrics.shuttingDown &&
            loop.consecutiveLoopFailures < 5 &&
            (loop.lastSuccessfulPollTs === 0 || stalePollSec < 30);
        jsonReply(res, healthy ? 200 : 503, {
            ok: healthy,
            loop,
            queue: queueMetrics,
            runtime: (() => {
                const snapshot = getRuntimeCapabilityDecisionSnapshot();
                return snapshot
                    ? buildRuntimeCapabilityPayload(snapshot)
                    : {
                        state: 'unknown',
                        detail: 'Runtime capability snapshot is not available yet',
                    };
            })(),
        });
        return;
    }
    if (req.method === 'GET' && url === '/api/services') {
        jsonReply(res, 200, { services: await pm2Status() });
        return;
    }
    if (req.method === 'GET' && url === '/api/readiness') {
        const serviceStatus = await pm2Status();
        const routingStats = aggregateSpend(readRecentLogs(7));
        const stepRoutingStats = aggregateStepRouting(readRecentStepRoutingLogs(7));
        const budgetState = runtimeRegistry.resolve('keet').runtime.getBudgetState();
        const budgetPolicy = budgetState.policy;
        const budgetUsage = budgetState.usage;
        const runtimeSplit = getRuntimeSplitMetrics();
        const sqlite = getSqliteMetrics();
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
        const executionReadiness = {
            eco: sanitizeExecutionReadiness(readinessDecision.execution_readiness.eco),
            standard: sanitizeExecutionReadiness(readinessDecision.execution_readiness.standard),
            pro: sanitizeExecutionReadiness(readinessDecision.execution_readiness.pro),
        };
        const capabilityPayload = buildRuntimeCapabilityPayload(readinessDecision);
        jsonReply(res, readinessDecision.bootable ? 200 : 503, {
            ok: readinessDecision.ok,
            ...capabilityPayload,
            runtime: {
                controlPort: CONTROL_PORT,
                adminTokenConfigured: Boolean(ADMIN_TOKEN),
            },
            deployment: {
                ...readinessDecision.deployment,
            },
            services: serviceStatus,
            routing: {
                requests7d: routingStats.totalRequests,
                tokens7d: routingStats.totalInputTokens + routingStats.totalOutputTokens,
                usd7d: Number(routingStats.totalUsdCost.toFixed(4)),
            },
            stepRouting: {
                steps7d: stepRoutingStats.totalSteps,
                escalated7d: stepRoutingStats.escalatedSteps,
            },
            budgets: {
                globalDailySpent: budgetUsage.globalDailySpent,
                globalDailyCap: budgetPolicy.global.daily_usd,
                globalMonthlySpent: budgetUsage.globalMonthlySpent,
                globalMonthlyCap: budgetPolicy.global.monthly_usd,
                modeDailySpent: budgetUsage.modeDailySpent,
            },
            runtimeSplit,
            execution: executionReadiness,
            sqlite,
        });
        return;
    }
    if (req.method === 'GET' && url === '/api/metrics/routing') {
        const stats = aggregateSpend(readRecentLogs(7));
        jsonReply(res, 200, { periodDays: 7, stats });
        return;
    }
    if (req.method === 'GET' && url === '/api/metrics/sqlite') {
        jsonReply(res, 200, getSqliteMetrics());
        return;
    }
    if (req.method === 'GET' && url === '/api/metrics/step-routing') {
        const stats = aggregateStepRouting(readRecentStepRoutingLogs(7));
        jsonReply(res, 200, { periodDays: 7, stats });
        return;
    }
    if (req.method === 'GET' && pathname === '/api/interactions') {
        const limitRaw = parsedUrl.searchParams.get('limit');
        const successRaw = parsedUrl.searchParams.get('success');
        const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
        const success = successRaw == null
            ? undefined
            : successRaw === '1' || successRaw.toLowerCase() === 'true';
        const interactions = listInteractions({
            limit: Number.isFinite(limit) ? limit : 50,
            provider: parsedUrl.searchParams.get('provider') || undefined,
            caller: parsedUrl.searchParams.get('caller') || undefined,
            success,
        });
        jsonReply(res, 200, {
            count: interactions.length,
            total: getInteractionCount(),
            interactions,
        });
        return;
    }
    if (req.method === 'GET' && url === '/api/keet/mcp') {
        const state = await getCoPawMcpAdapterState();
        jsonReply(res, 200, { ...state, warnings: sanitizeWarnings(state.warnings) });
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw/providers') {
        jsonReply(res, 200, {
            providers: listCoPawProviders(),
            diagnostics: getCoPawProviderDiagnostics(),
        });
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw/active-models') {
        jsonReply(res, 200, {
            ...getCoPawActiveModels(),
            diagnostics: getCoPawProviderDiagnostics(),
        });
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw/mcp') {
        const state = await getCoPawMcpAdapterState();
        jsonReply(res, 200, state);
        return;
    }
    const copawMcpClientMatch = pathname.match(/^\/api\/copaw\/mcp\/([^/]+)$/);
    if (req.method === 'GET' && copawMcpClientMatch) {
        const clientKey = decodeURIComponent(copawMcpClientMatch[1]);
        try {
            const client = getCoPawMcpClient(clientKey);
            jsonReply(res, 200, client);
        }
        catch (err) {
            jsonReply(res, 404, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
    }
    if (req.method === 'POST' && url === '/api/copaw/mcp') {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsedBody = parseJsonBody(rawBody);
        if (!parsedBody.ok) {
            jsonReply(res, 400, { error: parsedBody.error });
            return;
        }
        try {
            const client = createCoPawMcpClient(parsedBody.value);
            jsonReply(res, 200, client);
        }
        catch (err) {
            jsonReply(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
    }
    if (req.method === 'PUT' && copawMcpClientMatch) {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsedBody = parseJsonBody(rawBody);
        if (!parsedBody.ok) {
            jsonReply(res, 400, { error: parsedBody.error });
            return;
        }
        const clientKey = decodeURIComponent(copawMcpClientMatch[1]);
        try {
            const client = updateCoPawMcpClient(clientKey, parsedBody.value);
            jsonReply(res, 200, client);
        }
        catch (err) {
            jsonReply(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
    }
    const copawMcpToggleMatch = pathname.match(/^\/api\/copaw\/mcp\/([^/]+)\/toggle$/);
    if (req.method === 'POST' && copawMcpToggleMatch) {
        if (!requireMutatingAuth(req, res))
            return;
        const clientKey = decodeURIComponent(copawMcpToggleMatch[1]);
        try {
            const client = toggleCoPawMcpClient(clientKey);
            jsonReply(res, 200, client);
        }
        catch (err) {
            jsonReply(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
    }
    if (req.method === 'DELETE' && copawMcpClientMatch) {
        if (!requireMutatingAuth(req, res))
            return;
        const clientKey = decodeURIComponent(copawMcpClientMatch[1]);
        try {
            const result = deleteCoPawMcpClient(clientKey);
            jsonReply(res, 200, result);
        }
        catch (err) {
            jsonReply(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw/skills') {
        jsonReply(res, 200, { skills: listCoPawSkills() });
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw/workspace/status') {
        jsonReply(res, 200, getCoPawWorkspaceStatus());
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw/ui/state') {
        const mcp = await getCoPawMcpAdapterState();
        const runtimeSplit = getRuntimeSplitMetrics();
        const approvalCount = getTasksByStatus('awaiting_pro_shard_approval').length;
        const keetBudgetState = runtimeRegistry.resolve('keet').runtime.getBudgetState();
        jsonReply(res, 200, {
            ok: true,
            authority: getCoPawProviderDiagnostics().active_llm.authority,
            active_models: getCoPawActiveModels(),
            providers: listCoPawProviders(),
            mcp,
            workspace: getCoPawWorkspaceStatus(),
            approvals_pending: approvalCount,
            budgets: {
                policy: keetBudgetState.policy,
                usage: keetBudgetState.usage,
            },
            runtime_split: runtimeSplit,
            runs: readExecutionRunHistory(20, 0),
        });
        return;
    }
    if (req.method === 'POST' && url === '/api/trigger/dag/run') {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsedBody = parseJsonBody(rawBody);
        if (!parsedBody.ok) {
            jsonReply(res, 400, { error: parsedBody.error });
            return;
        }
        const body = parsedBody.value;
        if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
            jsonReply(res, 400, { error: 'Expected nodes[] and edges[] arrays' });
            return;
        }
        const nodes = body.nodes.map((node) => {
            if (!node || typeof node !== 'object') {
                return { id: '', kind: '' };
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
        const edges = body.edges.map((edge) => {
            if (!edge || typeof edge !== 'object') {
                return { from: '', to: '' };
            }
            const typed = edge;
            return {
                from: String(typed.from ?? ''),
                to: String(typed.to ?? ''),
            };
        });
        if (nodes.some((node) => !node.id || !node.kind)) {
            jsonReply(res, 400, { error: 'Each node requires id and kind' });
            return;
        }
        if (edges.some((edge) => !edge.from || !edge.to)) {
            jsonReply(res, 400, { error: 'Each edge requires from and to' });
            return;
        }
        try {
            const dispatch = await dispatchSignalDagWorkflow({
                dagId: typeof body.dag_id === 'string' && body.dag_id
                    ? body.dag_id
                    : `signal-dag-${Date.now()}`,
                nodes,
                edges,
                metadata: (body.metadata && typeof body.metadata === 'object')
                    ? body.metadata
                    : {},
            });
            const runLabel = dispatch.runId ? `run_id=${dispatch.runId}` : 'run accepted (no id returned)';
            jsonReply(res, 200, {
                accepted: true,
                runtime: 'trigger',
                result: runLabel,
                run_id: dispatch.runId,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            jsonReply(res, 502, { error: `Trigger DAG dispatch failed: ${message}` });
        }
        return;
    }
    if (req.method === 'POST' && (url === '/api/runtime/shell/action' || url === '/api/copaw/ui/action')) {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsedBody = parseJsonBody(rawBody);
        if (!parsedBody.ok) {
            jsonReply(res, 400, { error: parsedBody.error });
            return;
        }
        const parsedAction = parseControlActionRequest(parsedBody.value);
        if (!parsedAction.ok) {
            jsonReply(res, 400, {
                ok: false,
                error_code: parsedAction.error_code,
            });
            return;
        }
        const dispatchResult = dispatchControlAction(parsedAction.value, runtimeRegistry);
        if (!dispatchResult.ok) {
            const status = dispatchResult.error_code === 'invalid_payload' || dispatchResult.error_code === 'unsupported_action'
                ? 400
                : 500;
            jsonReply(res, status, dispatchResult);
            return;
        }
        jsonReply(res, 200, dispatchResult);
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw-agent/health') {
        const result = await callCoPawAgent('/agent/health');
        if (!result.ok) {
            jsonReply(res, result.status, { ok: false, degraded_reason: result.error, copaw_base_url: COPAW_BASE_URL });
            return;
        }
        jsonReply(res, 200, result.body);
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw-agent/capabilities') {
        const result = await callCoPawAgent('/agent/capabilities');
        if (!result.ok) {
            jsonReply(res, result.status, { ok: false, degraded_reason: result.error, copaw_base_url: COPAW_BASE_URL });
            return;
        }
        jsonReply(res, 200, result.body);
        return;
    }
    if (req.method === 'GET' && url === '/api/copaw-agent/sessions') {
        const sessions = readCoPawAgentSessions()
            .slice()
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        jsonReply(res, 200, { sessions });
        return;
    }
    if (req.method === 'POST' && url === '/api/copaw-agent/sessions') {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsedBody = parseJsonBody(rawBody);
        if (!parsedBody.ok) {
            jsonReply(res, 400, { error: parsedBody.error });
            return;
        }
        const sessionId = String(parsedBody.value?.session_id || crypto.randomUUID());
        const title = typeof parsedBody.value?.title === 'string' ? parsedBody.value.title : undefined;
        const session = upsertCoPawAgentSession(sessionId, title);
        jsonReply(res, 200, { ok: true, session });
        return;
    }
    if (req.method === 'POST' && url === '/api/copaw-agent/chat') {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsedBody = parseJsonBody(rawBody);
        if (!parsedBody.ok) {
            jsonReply(res, 400, { error: parsedBody.error });
            return;
        }
        const sessionId = String(parsedBody.value?.session_id || '');
        const prompt = String(parsedBody.value?.prompt || '');
        const messages = Array.isArray(parsedBody.value?.messages) ? parsedBody.value.messages : [];
        if (!sessionId || !prompt) {
            jsonReply(res, 400, { error: 'session_id and prompt are required' });
            return;
        }
        upsertCoPawAgentSession(sessionId, typeof parsedBody.value?.title === 'string' ? parsedBody.value.title : undefined);
        const result = await callCoPawAgent('/agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, prompt, messages }),
        });
        if (!result.ok) {
            jsonReply(res, result.status, { ok: false, degraded_reason: result.error, session_id: sessionId });
            return;
        }
        jsonReply(res, 200, result.body);
        return;
    }
    if (req.method === 'GET' && url === '/api/tasks') {
        jsonReply(res, 200, {
            tasks: getAllTasks().sort((a, b) => {
                const aTs = a.completedAt ?? a.startedAt;
                const bTs = b.completedAt ?? b.startedAt;
                return bTs - aTs;
            }),
        });
        return;
    }
    const taskMatch = url.match(/^\/api\/tasks\/([^/]+)$/);
    if (req.method === 'GET' && taskMatch) {
        const task = getTask(decodeURIComponent(taskMatch[1]));
        if (!task) {
            jsonReply(res, 404, { error: 'Task not found' });
            return;
        }
        jsonReply(res, 200, { task });
        return;
    }
    if (req.method === 'GET' && url === '/api/approvals/pending') {
        const tasks = getTasksByStatus('awaiting_pro_shard_approval').map((task) => {
            const pending = getPendingProShardTask(task.id);
            return {
                task,
                pending,
            };
        });
        jsonReply(res, 200, { approvals: tasks });
        return;
    }
    if (req.method === 'GET' && url === '/api/budgets') {
        const budgetState = runtimeRegistry.resolve('keet').runtime.getBudgetState();
        jsonReply(res, 200, { policy: budgetState.policy });
        return;
    }
    if (req.method === 'POST' && url === '/api/budgets') {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsed = parseJsonBody(rawBody);
        if (!parsed.ok) {
            jsonReply(res, 400, { error: parsed.error });
            return;
        }
        const infraDecision = platformAuthorityService.authorizePolicyMutation({ id: 'control-server', role: 'infra-admin' }, 'update_budget_policy', parsed.value ?? {});
        if (!infraDecision.allowed || !infraDecision.policy) {
            jsonReply(res, 403, { error: `Policy mutation denied: ${infraDecision.reason}` });
            return;
        }
        jsonReply(res, 200, { ok: true, policy: infraDecision.policy });
        return;
    }
    if (req.method === 'GET' && url === '/api/budgets/usage') {
        const budgetState = runtimeRegistry.resolve('keet').runtime.getBudgetState();
        jsonReply(res, 200, { usage: budgetState.usage });
        return;
    }
    const taskBudgetMatch = url.match(/^\/api\/tasks\/([^/]+)\/budget$/);
    if (req.method === 'GET' && taskBudgetMatch) {
        const taskId = decodeURIComponent(taskBudgetMatch[1]);
        const budgetState = runtimeRegistry.resolve('keet').runtime.getBudgetState(taskId);
        jsonReply(res, 200, budgetState.taskBudget ?? {
            policy: budgetState.policy,
            task: null,
            statuses: null,
        });
        return;
    }
    if (req.method === 'POST' && taskBudgetMatch) {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsed = parseJsonBody(rawBody);
        if (!parsed.ok) {
            jsonReply(res, 400, { error: parsed.error });
            return;
        }
        const taskId = decodeURIComponent(taskBudgetMatch[1]);
        const current = getBudgetPolicy();
        const nextOverrides = {
            ...(current.task_overrides ?? {}),
            [taskId]: {
                ...(current.task_overrides?.[taskId] ?? {}),
                ...(parsed.value ?? {}),
            },
        };
        const infraDecision = platformAuthorityService.authorizePolicyMutation({ id: 'control-server', role: 'infra-admin' }, 'update_task_budget', { task_overrides: nextOverrides });
        if (!infraDecision.allowed || !infraDecision.policy) {
            jsonReply(res, 403, { error: `Task budget mutation denied: ${infraDecision.reason}` });
            return;
        }
        jsonReply(res, 200, { ok: true, policy: infraDecision.policy, taskId });
        return;
    }
    const proApproveMatch = url.match(/^\/api\/tasks\/([^/]+)\/pro-shard\/approve$/);
    if (req.method === 'POST' && proApproveMatch) {
        if (!requireMutatingAuth(req, res))
            return;
        const taskId = decodeURIComponent(proApproveMatch[1]);
        const task = getTask(taskId);
        if (!task) {
            jsonReply(res, 404, { error: 'Task not found' });
            return;
        }
        const infraDecision = platformAuthorityService.approveProShard({ id: 'control-server', role: 'infra-admin' }, taskId);
        if (!infraDecision.allowed || !infraDecision.approval) {
            jsonReply(res, 403, { error: `Approval denied: ${infraDecision.reason}` });
            return;
        }
        jsonReply(res, 200, { ok: true, approval: infraDecision.approval, alert_file: infraDecision.alert_file ?? null });
        return;
    }
    if (req.method === 'GET' && url === '/api/metrics/cost-guards') {
        const budgetState = runtimeRegistry.resolve('keet').runtime.getBudgetState();
        const usage = budgetState.usage;
        const policy = budgetState.policy;
        const incidents = usage.blockEvents.slice(-50);
        jsonReply(res, 200, {
            periodDays: 30,
            incidents,
            nearLimit: {
                globalDailyPct: Number((usage.globalDailySpent / Math.max(policy.global.daily_usd, 0.0001)).toFixed(3)),
                byModePct: {
                    eco: Number((usage.modeDailySpent.eco / Math.max(policy.mode.eco.daily_usd, 0.0001)).toFixed(3)),
                    standard: Number((usage.modeDailySpent.standard / Math.max(policy.mode.standard.daily_usd, 0.0001)).toFixed(3)),
                    pro: Number((usage.modeDailySpent.pro / Math.max(policy.mode.pro.daily_usd, 0.0001)).toFixed(3)),
                },
            },
        });
        return;
    }
    if (req.method === 'GET' && url === '/api/metrics/runtime-split') {
        jsonReply(res, 200, {
            ...getRuntimeSplitMetrics(),
            lane_health: getCoPawLaneHealth(),
            migration: {
                phase: KEET_COPAW_MIGRATION_PHASE,
                telemetry: getCoPawMigrationTelemetry(),
                gate: getMigrationGateStatus(),
            },
        });
        return;
    }
    if (req.method === 'POST' && url === '/api/mode') {
        if (!requireMutatingAuth(req, res))
            return;
        let rawBody = '';
        try {
            rawBody = await readBody(req);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
            jsonReply(res, status, { error: msg });
            return;
        }
        const parsed = parseJsonBody(rawBody);
        if (!parsed.ok) {
            jsonReply(res, 400, { error: parsed.error });
            return;
        }
        const mode = parsed.value?.mode;
        if (mode !== 'local' && mode !== 'cloud') {
            jsonReply(res, 400, { error: 'mode must be "local" or "cloud"' });
            return;
        }
        const env = mode === 'local' ? 'local_only' : 'production';
        await execAsync(`pm2 restart keet --env ${env}`);
        jsonReply(res, 200, { ok: true, mode });
        return;
    }
    const svcMatch = url.match(/^\/api\/services\/([\w-]+)\/(start|stop|restart)$/);
    if (req.method === 'POST' && svcMatch) {
        if (!requireMutatingAuth(req, res))
            return;
        const [, name, action] = svcMatch;
        if (!MANAGED.includes(name)) {
            jsonReply(res, 400, { error: 'Unknown service' });
            return;
        }
        await execAsync(`pm2 ${action} ${name}`);
        jsonReply(res, 200, { ok: true, name, action });
        return;
    }
    jsonReply(res, 404, { error: 'Not found' });
}
export function startControlServer() {
    const server = createServer((req, res) => {
        handle(req, res).catch(err => {
            logger.error({ err }, 'control-server: unhandled error');
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('{"error":"internal"}');
            }
        });
    });
    server.on('error', (err) => {
        if (err.code !== 'EADDRINUSE') {
            logger.fatal({ err, port: CONTROL_PORT }, 'control-server: failed to start');
            process.exit(1);
            return;
        }
        void isExistingControlServerHealthy().then((healthy) => {
            if (healthy) {
                logger.warn({ port: CONTROL_PORT }, 'control-server: already running, reusing existing listener');
                server.close();
                return;
            }
            logger.fatal({ err, port: CONTROL_PORT }, 'control-server: port already in use by an unknown process');
            process.exit(1);
        });
    });
    server.listen(CONTROL_PORT, '127.0.0.1', () => {
        logger.info({ port: CONTROL_PORT }, 'control-server: ready');
    });
}
//# sourceMappingURL=control-server.js.map