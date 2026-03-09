import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { KEET_INTERACTION_LOGGING, STORE_DIR } from './config.js';
import { logger } from './logger.js';
const MAX_PREVIEW_CHARS = 4_000;
const MAX_ERROR_CHARS = 1_000;
let db = null;
let dbPathOverride = null;
function resolveDbPath() {
    return dbPathOverride ?? path.join(STORE_DIR, 'messages.db');
}
function ensureSchema(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS llm_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      caller TEXT NOT NULL,
      prompt_preview TEXT NOT NULL DEFAULT '',
      response_preview TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_llm_interactions_ts ON llm_interactions(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_llm_interactions_provider ON llm_interactions(provider, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_llm_interactions_caller ON llm_interactions(caller, ts DESC);
  `);
}
function getDb() {
    if (db)
        return db;
    const dbPath = resolveDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    ensureSchema(db);
    return db;
}
function truncateText(text, maxChars) {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized)
        return '';
    if (normalized.length <= maxChars)
        return normalized;
    return `${normalized.slice(0, maxChars).trimEnd()}\n...[truncated]`;
}
function redactSecrets(text) {
    return text
        .replace(/\b(Bearer)\s+[A-Za-z0-9._-]+\b/g, '$1 [REDACTED]')
        .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=([^\s"'`]+)/gi, '$1=[REDACTED]')
        .replace(/("(?:api[_-]?key|token|secret|password)"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
        .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)([^\s"'`]+)/gi, '$1[REDACTED]');
}
export function sanitizeInteractionPreview(text, maxChars = MAX_PREVIEW_CHARS) {
    return truncateText(redactSecrets(text), maxChars);
}
export function sanitizeInteractionError(text) {
    return sanitizeInteractionPreview(text, MAX_ERROR_CHARS);
}
export function formatInteractionPrompt(messages) {
    return messages
        .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
        .join('\n\n');
}
export function inferInteractionCaller(projectRoot = process.cwd()) {
    const stack = new Error().stack?.split('\n').slice(1) ?? [];
    for (const line of stack) {
        const match = line.match(/\(?((?:\/|[A-Za-z]:\\).+?):(\d+):(\d+)\)?$/);
        if (!match)
            continue;
        const filePath = path.normalize(match[1]);
        if (filePath.includes('node_modules'))
            continue;
        if (filePath.endsWith(`${path.sep}llm-router.ts`))
            continue;
        if (filePath.endsWith(`${path.sep}interaction-store.ts`))
            continue;
        const relativePath = path.relative(projectRoot, filePath);
        if (!relativePath || relativePath.startsWith('..'))
            continue;
        return `${relativePath}:${match[2]}`;
    }
    return 'unknown';
}
export function recordInteraction(input) {
    if (!KEET_INTERACTION_LOGGING)
        return;
    try {
        getDb()
            .prepare(`
        INSERT INTO llm_interactions (
          ts,
          provider,
          model,
          caller,
          prompt_preview,
          response_preview,
          input_tokens,
          output_tokens,
          estimated_cost_usd,
          duration_ms,
          success,
          error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
            .run(input.ts ?? new Date().toISOString(), input.provider, input.model, input.caller, sanitizeInteractionPreview(input.promptPreview), sanitizeInteractionPreview(input.responsePreview ?? ''), Math.max(0, Math.round(input.inputTokens)), Math.max(0, Math.round(input.outputTokens)), Number.isFinite(input.estimatedCostUsd) ? input.estimatedCostUsd : 0, Math.max(0, Math.round(input.durationMs)), input.success ? 1 : 0, input.error ? sanitizeInteractionError(input.error) : null);
    }
    catch (err) {
        logger.warn({ err, provider: input.provider, model: input.model }, 'Failed to persist LLM interaction log entry');
    }
}
export function listInteractions(options = {}) {
    if (!db && !fs.existsSync(resolveDbPath()))
        return [];
    const clauses = [];
    const params = [];
    if (options.provider) {
        clauses.push('provider = ?');
        params.push(options.provider);
    }
    if (options.caller) {
        clauses.push('caller = ?');
        params.push(options.caller);
    }
    if (typeof options.success === 'boolean') {
        clauses.push('success = ?');
        params.push(options.success ? 1 : 0);
    }
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    params.push(limit);
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = getDb()
        .prepare(`
      SELECT
        id,
        ts,
        provider,
        model,
        caller,
        prompt_preview,
        response_preview,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        duration_ms,
        success,
        error
      FROM llm_interactions
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
    `)
        .all(...params);
    return rows.map((row) => ({
        ...row,
        success: row.success === 1,
    }));
}
export function getInteractionCount() {
    if (!db && !fs.existsSync(resolveDbPath()))
        return 0;
    const row = getDb()
        .prepare('SELECT COUNT(*) as count FROM llm_interactions')
        .get();
    return Number(row.count || 0);
}
export function setInteractionStorePathForTests(nextPath) {
    db?.close();
    db = null;
    dbPathOverride = nextPath;
}
export function resetInteractionStoreForTests() {
    setInteractionStorePathForTests(null);
}
//# sourceMappingURL=interaction-store.js.map