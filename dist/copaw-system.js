/**
 * CoPaw System — stub implementation (non-MCP functions).
 * MCP client management is file-backed via KEET_MCP_CONFIG_PATH.
 * All other functions return safe no-op defaults; authority always reports 'legacy'.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { KEET_MCP_CONFIG_PATH } from './config.js';
// ── MCP config file I/O ──────────────────────────────────────────────────────
function readMcpConfigFile() {
    if (!existsSync(KEET_MCP_CONFIG_PATH))
        return { servers: {} };
    try {
        return JSON.parse(readFileSync(KEET_MCP_CONFIG_PATH, 'utf-8'));
    }
    catch {
        return { servers: {} };
    }
}
function writeMcpConfigFile(config) {
    const dir = path.dirname(KEET_MCP_CONFIG_PATH);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(KEET_MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
}
function entryToClientInfo(key, entry) {
    return { key, ...entry, health: 'unknown' };
}
const RESERVED_KEYS = new Set(['nanoclaw']);
// ── Core resolution stubs ─────────────────────────────────────────────────────
export function resolveEffectiveOllamaBaseUrl(legacyBaseUrl) {
    return { base_url: legacyBaseUrl, authority: 'legacy', warnings: [] };
}
export function resolveEffectiveOllamaModel(legacyModel) {
    return { model: legacyModel, authority: 'legacy', warnings: [] };
}
export function resolveEffectiveProviderModel(_providerId, legacyModel) {
    return { model: legacyModel, authority: 'legacy', warnings: [] };
}
export function resolveEffectiveProviderCredential(_providerId, legacyApiKey, legacyBaseUrl = '') {
    return { api_key: legacyApiKey, base_url: legacyBaseUrl, authority: 'legacy', warnings: [] };
}
export function validateKeetExecutionReadiness(mode) {
    return { ok: true, errors: [], warnings: [], mode };
}
// ── Memory ────────────────────────────────────────────────────────────────────
export function readCoPawMemoryRecord(opts) {
    if (opts.legacyPath && existsSync(opts.legacyPath)) {
        try {
            return { content: readFileSync(opts.legacyPath, 'utf-8') };
        }
        catch {
            return { content: '' };
        }
    }
    return { content: '' };
}
// ── Active models ─────────────────────────────────────────────────────────────
export function getCoPawActiveModels() {
    return {};
}
export function setCoPawActiveModels(_req) {
    return {};
}
// ── Provider diagnostics ──────────────────────────────────────────────────────
export function getCoPawProviderDiagnostics() {
    return { active_llm: { authority: 'legacy' } };
}
// ── MCP adapter state (file-backed) ──────────────────────────────────────────
export async function getKeetMcpAdapterState() {
    const config = readMcpConfigFile();
    const all = Object.entries(config.servers).map(([k, v]) => entryToClientInfo(k, v));
    const enabled = all.filter(c => c.enabled);
    return {
        enabled_clients: enabled,
        warnings: [],
        summary: enabled.length > 0
            ? `${enabled.length} MCP server(s) enabled: ${enabled.map(c => c.key).join(', ')}`
            : 'No MCP servers enabled',
    };
}
export function listCoPawMcpClients() {
    const config = readMcpConfigFile();
    return Object.entries(config.servers).map(([k, v]) => entryToClientInfo(k, v));
}
export async function listCoPawMcpClientsWithHealth() {
    return listCoPawMcpClients();
}
export function getCoPawMcpClient(key) {
    const config = readMcpConfigFile();
    const entry = config.servers[key];
    if (!entry)
        throw new Error(`MCP client '${key}' not found`);
    return entryToClientInfo(key, entry);
}
export function createCoPawMcpClient(cfg) {
    if (!cfg.key)
        throw new Error('key is required');
    if (RESERVED_KEYS.has(cfg.key))
        throw new Error(`'${cfg.key}' is a reserved key`);
    if (!cfg.transport)
        throw new Error('transport is required (stdio, sse, or http)');
    if (cfg.transport === 'stdio' && !cfg.command)
        throw new Error('command is required for stdio transport');
    if ((cfg.transport === 'sse' || cfg.transport === 'http') && !cfg.url)
        throw new Error('url is required for sse/http transport');
    const config = readMcpConfigFile();
    if (config.servers[cfg.key])
        throw new Error(`MCP client '${cfg.key}' already exists`);
    const entry = {
        name: cfg.name || cfg.key,
        enabled: cfg.enabled ?? false,
        transport: cfg.transport,
        ...(cfg.command !== undefined && { command: cfg.command }),
        ...(cfg.args !== undefined && { args: cfg.args }),
        ...(cfg.env !== undefined && { env: cfg.env }),
        ...(cfg.url !== undefined && { url: cfg.url }),
        ...(cfg.headers !== undefined && { headers: cfg.headers }),
    };
    config.servers[cfg.key] = entry;
    writeMcpConfigFile(config);
    return entryToClientInfo(cfg.key, entry);
}
export function updateCoPawMcpClient(key, patch) {
    const config = readMcpConfigFile();
    const existing = config.servers[key];
    if (!existing)
        throw new Error(`MCP client '${key}' not found`);
    const updated = { ...existing, ...patch };
    delete updated.key;
    delete updated.health;
    config.servers[key] = updated;
    writeMcpConfigFile(config);
    return entryToClientInfo(key, config.servers[key]);
}
export function toggleCoPawMcpClient(key) {
    const config = readMcpConfigFile();
    const existing = config.servers[key];
    if (!existing)
        throw new Error(`MCP client '${key}' not found`);
    existing.enabled = !existing.enabled;
    writeMcpConfigFile(config);
    return entryToClientInfo(key, existing);
}
export function deleteCoPawMcpClient(key) {
    const config = readMcpConfigFile();
    if (!config.servers[key])
        throw new Error(`MCP client '${key}' not found`);
    delete config.servers[key];
    writeMcpConfigFile(config);
    return { deleted: true };
}
export async function executeKeetMcpApiStep(_desc) {
    // Orchestrator-level MCP calls — future work.
    // Container fallback handles execution via SDK's native MCP support.
    return { handled: false, success: false, output: '' };
}
// ── SDK-format export ────────────────────────────────────────────────────────
export function getEnabledMcpServersForSdk() {
    const config = readMcpConfigFile();
    const result = {};
    for (const [key, entry] of Object.entries(config.servers)) {
        if (!entry.enabled)
            continue;
        if (entry.transport === 'stdio') {
            result[key] = { command: entry.command, args: entry.args, env: entry.env };
        }
        else if (entry.transport === 'sse') {
            result[key] = { type: 'sse', url: entry.url, headers: entry.headers };
        }
        else if (entry.transport === 'http') {
            result[key] = { type: 'http', url: entry.url, headers: entry.headers };
        }
    }
    return result;
}
// ── Workspace & provider/skill lists ─────────────────────────────────────────
export function getCoPawWorkspaceStatus() {
    return {};
}
export function listCoPawProviders() {
    return [];
}
export function listCoPawSkills() {
    return [];
}
//# sourceMappingURL=copaw-system.js.map