import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { logger } from './logger.js';
let db;
function createSchema(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'claude',
      session_id TEXT NOT NULL,
      PRIMARY KEY (group_folder, provider)
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      PRIMARY KEY (message_id, chat_jid)
    );

    CREATE TABLE IF NOT EXISTS evolution_suggestions (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      suggestion_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      reason TEXT,
      suggested_at TEXT NOT NULL,
      re_evaluate_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      slug TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_evolution_re_eval ON evolution_suggestions(re_evaluate_at, status);
    CREATE INDEX IF NOT EXISTS idx_evolution_group ON evolution_suggestions(group_folder, status);

    CREATE TABLE IF NOT EXISTS project_memory (
      project_id TEXT PRIMARY KEY,
      last_touched_unix INTEGER NOT NULL,
      task_embeddings TEXT NOT NULL DEFAULT '[]',
      canonical_summary TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS memory_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      ts_unix INTEGER NOT NULL,
      signal_type TEXT NOT NULL,
      weight REAL NOT NULL,
      task_id TEXT,
      embedding_distance REAL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_signals_project ON memory_signals(project_id, ts_unix);
    CREATE TABLE IF NOT EXISTS memory_token_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_id TEXT,
      tier TEXT NOT NULL,
      anchor_tokens INTEGER NOT NULL,
      saved_vs_full INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_memory_token_log_ts ON memory_token_log(ts);

    CREATE TABLE IF NOT EXISTS staging_cache (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      staged_at_unix INTEGER NOT NULL,
      promoted INTEGER NOT NULL DEFAULT 0,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_staging_cache_project ON staging_cache(project_id, staged_at_unix);
  `);
    // Add context_mode column if it doesn't exist (migration for existing DBs)
    try {
        database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`);
    }
    catch {
        /* column already exists */
    }
    // Add provider_override column if it doesn't exist
    try {
        database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN provider_override TEXT`);
    }
    catch {
        /* column already exists */
    }
    // Add slug column to evolution_suggestions if it doesn't exist
    try {
        database.exec(`ALTER TABLE evolution_suggestions ADD COLUMN slug TEXT`);
    }
    catch {
        /* column already exists */
    }
    // Migrate sessions table to composite key (group_folder, provider) if it's the old schema
    try {
        // Check if provider column exists
        const hasProvider = database.prepare("PRAGMA table_info(sessions)").all().some((col) => col.name === 'provider');
        if (!hasProvider) {
            logger.info('Migrating sessions table to support multi-provider (Agentic Routing)');
            database.exec(`
        CREATE TABLE sessions_new (
          group_folder TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'claude',
          session_id TEXT NOT NULL,
          PRIMARY KEY (group_folder, provider)
        );
        INSERT INTO sessions_new (group_folder, session_id) SELECT group_folder, session_id FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_new RENAME TO sessions;
      `);
        }
    }
    catch (err) {
        logger.error({ err }, 'Error migrating sessions table');
    }
    // Add is_bot_message column if it doesn't exist (migration for existing DBs)
    try {
        database.exec(`ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`);
        // Backfill: mark existing bot messages that used the content prefix pattern
        database.prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`).run(`${ASSISTANT_NAME}:%`);
    }
    catch {
        /* column already exists */
    }
    // Add channel and is_group columns if they don't exist (migration for existing DBs)
    try {
        database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
        database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
        // Backfill from JID patterns
        database.exec(`UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`);
        database.exec(`UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`);
        database.exec(`UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`);
        database.exec(`UPDATE chats SET channel = 'telegram', is_group = 1 WHERE jid LIKE 'tg:%'`);
    }
    catch {
        /* columns already exist */
    }
    // Add preferred_model and model_profile columns to registered_groups if they don't exist
    try {
        database.exec(`ALTER TABLE registered_groups ADD COLUMN preferred_model TEXT`);
    }
    catch {
        /* column already exists */
    }
    try {
        database.exec(`ALTER TABLE registered_groups ADD COLUMN model_profile TEXT DEFAULT 'smart'`);
    }
    catch {
        /* column already exists */
    }
    // Sprint 15: Add parent_id to memory_signals for causality tracking
    try {
        database.exec(`ALTER TABLE memory_signals ADD COLUMN parent_id TEXT`);
    }
    catch {
        /* column already exists */
    }
}
export function initDatabase() {
    const dbPath = path.join(STORE_DIR, 'messages.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    createSchema(db);
    // Migrate from JSON files if they exist
    migrateJsonState();
}
/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase() {
    db = new Database(':memory:');
    createSchema(db);
}
/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(chatJid, timestamp, name, channel, isGroup) {
    const ch = channel ?? null;
    const group = isGroup === undefined ? null : isGroup ? 1 : 0;
    if (name) {
        // Update with name, preserving existing timestamp if newer
        db.prepare(`
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `).run(chatJid, name, timestamp, ch, group);
    }
    else {
        // Update timestamp only, preserve existing name if any
        db.prepare(`
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `).run(chatJid, chatJid, timestamp, ch, group);
    }
}
/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid, name) {
    db.prepare(`
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `).run(chatJid, name, new Date().toISOString());
}
/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats() {
    return db
        .prepare(`
    SELECT jid, name, last_message_time, channel, is_group
    FROM chats
    ORDER BY last_message_time DESC
  `)
        .all();
}
/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync() {
    // Store sync time in a special chat entry
    const row = db
        .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
        .get();
    return row?.last_message_time || null;
}
/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync() {
    const now = new Date().toISOString();
    db.prepare(`INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`).run(now);
}
/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg) {
    db.prepare(`INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(msg.id, msg.chat_jid, msg.sender, msg.sender_name, msg.content, msg.timestamp, msg.is_from_me ? 1 : 0, msg.is_bot_message ? 1 : 0);
}
/**
 * Store a message directly (for non-WhatsApp channels that don't use Baileys proto).
 */
export function storeMessageDirect(msg) {
    db.prepare(`INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(msg.id, msg.chat_jid, msg.sender, msg.sender_name, msg.content, msg.timestamp, msg.is_from_me ? 1 : 0, msg.is_bot_message ? 1 : 0);
}
export function getNewMessages(jids, perGroupTimestamps, botPrefix) {
    // Support legacy callers (e.g. intake-policy.ts) that pass a single string timestamp.
    const isLegacy = typeof perGroupTimestamps === 'string';
    const legacyTs = isLegacy ? perGroupTimestamps : '';
    if (jids.length === 0)
        return { messages: [], newTimestamp: legacyTs };
    const tsMap = isLegacy
        ? Object.fromEntries(jids.map((j) => [j, legacyTs]))
        : perGroupTimestamps;
    // Build a per-JID WHERE clause so each group uses its own confirmed cursor.
    // Filter bot messages using both the is_bot_message flag AND the content
    // prefix as a backstop for messages written before the migration ran.
    const conditions = [];
    const params = [];
    for (const jid of jids) {
        const ts = tsMap[jid] ?? '';
        conditions.push(`(chat_jid = ? AND timestamp > ?)`);
        params.push(jid, ts);
    }
    params.push(`${botPrefix}:%`);
    const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE (${conditions.join(' OR ')})
      AND is_bot_message = 0 AND content NOT LIKE ?
    ORDER BY timestamp
  `;
    const rows = db.prepare(sql).all(...params);
    // For legacy callers: default newTimestamp to the passed string so no-message
    // calls return the same cursor they passed in (preserves old behaviour).
    let newTimestamp = legacyTs;
    for (const row of rows) {
        if (row.timestamp > newTimestamp)
            newTimestamp = row.timestamp;
    }
    return { messages: rows, newTimestamp };
}
export function getMessagesSince(chatJid, sinceTimestamp, botPrefix) {
    // Filter bot messages using both the is_bot_message flag AND the content
    // prefix as a backstop for messages written before the migration ran.
    const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE chat_jid = ? AND timestamp > ?
      AND is_bot_message = 0 AND content NOT LIKE ?
    ORDER BY timestamp
  `;
    return db
        .prepare(sql)
        .all(chatJid, sinceTimestamp, `${botPrefix}:%`);
}
let cachedAllRegisteredGroups = null;
let cachedAllTasks = null;
// --- Registered group accessors ---
export function getRegisteredGroup(jid) {
    // Try to get from cache first
    if (cachedAllRegisteredGroups && cachedAllRegisteredGroups[jid]) {
        const group = cachedAllRegisteredGroups[jid];
        return { ...group, jid }; // Add jid to the result
    }
    const row = db
        .prepare('SELECT * FROM registered_groups WHERE jid = ?')
        .get(jid);
    if (!row)
        return undefined;
    return {
        jid: row.jid,
        name: row.name,
        folder: row.folder,
        trigger: row.trigger_pattern,
        added_at: row.added_at,
        containerConfig: row.container_config
            ? JSON.parse(row.container_config)
            : undefined,
        requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
        preferredModel: row.preferred_model || undefined,
        modelProfile: row.model_profile || 'smart',
    };
}
export function setRegisteredGroup(jid, group) {
    db.prepare(`INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, preferred_model, model_profile)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(jid, group.name, group.folder, group.trigger, group.added_at, group.containerConfig ? JSON.stringify(group.containerConfig) : null, group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0, group.preferredModel || null, group.modelProfile || 'smart');
    // Invalidate cache
    cachedAllRegisteredGroups = null;
}
export function deleteRegisteredGroup(jid) {
    const result = db
        .prepare('DELETE FROM registered_groups WHERE jid = ?')
        .run(jid);
    // Invalidate cache
    cachedAllRegisteredGroups = null;
    return result.changes > 0;
}
export function getAllRegisteredGroups() {
    if (cachedAllRegisteredGroups) {
        return cachedAllRegisteredGroups;
    }
    const rows = db
        .prepare('SELECT * FROM registered_groups')
        .all();
    const result = {};
    for (const row of rows) {
        result[row.jid] = {
            name: row.name,
            folder: row.folder,
            trigger: row.trigger_pattern,
            added_at: row.added_at,
            containerConfig: row.container_config
                ? JSON.parse(row.container_config)
                : undefined,
            requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
            preferredModel: row.preferred_model || undefined,
            modelProfile: row.model_profile || 'smart',
        };
    }
    cachedAllRegisteredGroups = result;
    return result;
}
// --- Scheduled Task Accessors ---
export function createTask(task) {
    db.prepare(`
      INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, provider_override, next_run, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(task.id, task.group_folder, task.chat_jid, task.prompt, task.schedule_type, task.schedule_value, task.context_mode || 'isolated', task.provider_override ?? null, task.next_run, task.status, task.created_at);
    // Invalidate cache
    cachedAllTasks = null;
}
export function getTaskById(id) {
    // No caching for single task fetch, as it's less frequently accessed than all tasks
    return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
}
export function getTasksForGroup(groupFolder) {
    // No caching for group-specific tasks, as it varies per group
    return db
        .prepare('SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC')
        .all(groupFolder);
}
export function getAllTasks() {
    if (cachedAllTasks) {
        return cachedAllTasks;
    }
    const tasks = db
        .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
        .all();
    cachedAllTasks = tasks;
    return tasks;
}
export function updateTask(id, updates) {
    const fields = [];
    const values = [];
    if (updates.prompt !== undefined) {
        fields.push('prompt = ?');
        values.push(updates.prompt);
    }
    if (updates.schedule_type !== undefined) {
        fields.push('schedule_type = ?');
        values.push(updates.schedule_type);
    }
    if (updates.schedule_value !== undefined) {
        fields.push('schedule_value = ?');
        values.push(updates.schedule_value);
    }
    if (updates.provider_override !== undefined) {
        fields.push('provider_override = ?');
        values.push(updates.provider_override);
    }
    if (updates.next_run !== undefined) {
        fields.push('next_run = ?');
        values.push(updates.next_run);
    }
    if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
    }
    if (fields.length === 0)
        return;
    values.push(id);
    db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    // Invalidate cache
    cachedAllTasks = null;
}
export function deleteTask(id) {
    // Delete child records first (FK constraint)
    db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
    // Invalidate cache
    cachedAllTasks = null;
}
export function getDueTasks() {
    // No caching for due tasks, as it's time-dependent
    const now = new Date().toISOString();
    return db
        .prepare(`
      SELECT * FROM scheduled_tasks
      WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
      ORDER BY next_run
    `)
        .all(now);
}
export function updateTaskAfterRun(id, nextRun, lastResult) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE scheduled_tasks
      SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
      WHERE id = ?
    `).run(nextRun, now, lastResult, nextRun, id);
    // Invalidate cache
    cachedAllTasks = null;
}
export function logTaskRun(log) {
    db.prepare(`
      INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(log.task_id, log.run_at, log.duration_ms, log.status, log.result, log.error);
    // No cache invalidation needed for run logs
}
export function getTaskAnalytics() {
    // No caching for analytics, as it's a computed aggregate
    return db.prepare(`
          SELECT 
              t.group_folder,
              COUNT(*) as total_runs,
              ROUND(CAST(SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) as success_rate,
              AVG(l.duration_ms) as avg_duration_ms
          FROM scheduled_tasks t
          JOIN task_run_logs l ON t.id = l.task_id
          GROUP BY t.group_folder
      `).all();
}
export function getRecentRunLogs(limit = 50) {
    // No caching for recent run logs, as it's time-dependent
    return db.prepare(`
          SELECT l.*, t.group_folder
          FROM task_run_logs l
          JOIN scheduled_tasks t ON l.task_id = t.id
          ORDER BY l.run_at DESC
          LIMIT ?
      `).all(limit);
}
// --- Router state accessors ---
export function getRouterState(key) {
    const row = db
        .prepare('SELECT value FROM router_state WHERE key = ?')
        .get(key);
    return row?.value;
}
export function setRouterState(key, value) {
    db.prepare('INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)').run(key, value);
}
// --- Session accessors ---
export function getSession(groupFolder, provider) {
    const row = db
        .prepare('SELECT session_id FROM sessions WHERE group_folder = ? AND provider = ?')
        .get(groupFolder, provider);
    return row?.session_id;
}
export function setSession(groupFolder, provider, sessionId) {
    db.prepare('INSERT OR REPLACE INTO sessions (group_folder, provider, session_id) VALUES (?, ?, ?)').run(groupFolder, provider, sessionId);
}
/** Returns all sessions as { groupFolder: { provider: sessionId } } */
export function getAllSessions() {
    const rows = db
        .prepare('SELECT group_folder, provider, session_id FROM sessions')
        .all();
    const result = {};
    for (const row of rows) {
        if (!result[row.group_folder])
            result[row.group_folder] = {};
        result[row.group_folder][row.provider] = row.session_id;
    }
    return result;
}
export function insertEvolutionSuggestion(suggestion) {
    const created_at = new Date().toISOString();
    db.prepare(`INSERT INTO evolution_suggestions (id, group_folder, suggestion_type, title, content, reason, suggested_at, re_evaluate_at, status, slug, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(suggestion.id, suggestion.group_folder, suggestion.suggestion_type, suggestion.title, suggestion.content, suggestion.reason ?? null, suggestion.suggested_at, suggestion.re_evaluate_at, suggestion.status, suggestion.slug ?? null, created_at);
}
export function getEvolutionSuggestionsForReEvaluation() {
    const now = new Date().toISOString();
    return db
        .prepare(`SELECT * FROM evolution_suggestions WHERE status = 'pending' AND re_evaluate_at <= ? ORDER BY re_evaluate_at`)
        .all(now);
}
export function getSuggestedEvolutionForGroup(groupFolder) {
    return db
        .prepare(`SELECT * FROM evolution_suggestions WHERE group_folder = ? AND status = 'suggested' ORDER BY suggested_at DESC LIMIT 1`)
        .get(groupFolder);
}
export function updateEvolutionSuggestionStatus(id, status) {
    db.prepare('UPDATE evolution_suggestions SET status = ? WHERE id = ?').run(status, id);
}
export function getLastReflectionAt(groupFolder) {
    const row = db
        .prepare('SELECT value FROM router_state WHERE key = ?')
        .get(`evolution_last_reflection_${groupFolder}`);
    return row?.value ?? null;
}
export function setLastReflectionAt(groupFolder, iso) {
    setRouterState(`evolution_last_reflection_${groupFolder}`, iso);
}
// --- Project memory accessors ---
export function getProjectMemory(projectId) {
    return db.prepare('SELECT * FROM project_memory WHERE project_id = ?').get(projectId);
}
export function upsertProjectMemory(projectId, lastTouchedUnix, taskEmbeddings, canonicalSummary) {
    db.prepare(`
    INSERT INTO project_memory (project_id, last_touched_unix, task_embeddings, canonical_summary)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      last_touched_unix = excluded.last_touched_unix,
      task_embeddings = excluded.task_embeddings,
      canonical_summary = excluded.canonical_summary
  `).run(projectId, lastTouchedUnix, JSON.stringify(taskEmbeddings), canonicalSummary);
}
export function upsertCanonicalSummary(projectId, summary) {
    db.prepare(`
    INSERT INTO project_memory (project_id, last_touched_unix, task_embeddings, canonical_summary)
    VALUES (?, ?, '[]', ?)
    ON CONFLICT(project_id) DO UPDATE SET
      last_touched_unix = excluded.last_touched_unix,
      canonical_summary = excluded.canonical_summary
  `).run(projectId, Math.floor(Date.now() / 1000), summary);
}
/**
 * Append to a project's canonical summary without replacing existing content.
 * Deduplicates by session tag — if sessionTag already in summary, skips.
 */
export function appendCanonicalSummary(projectId, sessionTag, newContent) {
    const existing = db.prepare('SELECT canonical_summary FROM project_memory WHERE project_id = ?').get(projectId);
    if (existing?.canonical_summary?.includes(sessionTag))
        return; // dedup
    const updated = existing ? `${existing.canonical_summary}\n\n${newContent}` : newContent;
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
    INSERT INTO project_memory (project_id, last_touched_unix, task_embeddings, canonical_summary)
    VALUES (?, ?, '[]', ?)
    ON CONFLICT(project_id) DO UPDATE SET
      last_touched_unix = excluded.last_touched_unix,
      canonical_summary = ?
  `).run(projectId, now, updated, updated);
}
export function appendTaskEmbedding(projectId, embedding) {
    const existing = getProjectMemory(projectId);
    let embeddings = [];
    if (existing) {
        try {
            embeddings = JSON.parse(existing.task_embeddings);
        }
        catch { /* corrupt → reset */ }
    }
    embeddings.push(embedding);
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
    INSERT INTO project_memory (project_id, last_touched_unix, task_embeddings, canonical_summary)
    VALUES (?, ?, ?, '')
    ON CONFLICT(project_id) DO UPDATE SET
      last_touched_unix = excluded.last_touched_unix,
      task_embeddings = excluded.task_embeddings
  `).run(projectId, now, JSON.stringify(embeddings));
}
export function insertMemorySignal(projectId, tsUnix, signalType, weight, taskId, embeddingDistance, parentId) {
    db.prepare(`
    INSERT INTO memory_signals (project_id, ts_unix, signal_type, weight, task_id, embedding_distance, parent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, tsUnix, signalType, weight, taskId ?? null, embeddingDistance ?? null, parentId ?? null);
}
export function getMemorySignalsForProject(projectId, sinceUnix) {
    return db.prepare('SELECT ts_unix, signal_type, weight FROM memory_signals WHERE project_id = ? AND ts_unix >= ? ORDER BY ts_unix ASC').all(projectId, sinceUnix);
}
export function insertMemoryTokenLog(sessionId, projectId, tier, anchorTokens, savedVsFull) {
    db.prepare(`
    INSERT INTO memory_token_log (ts, session_id, project_id, tier, anchor_tokens, saved_vs_full)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(new Date().toISOString(), sessionId, projectId ?? null, tier, anchorTokens, savedVsFull);
}
// --- JSON migration ---
function migrateJsonState() {
    const migrateFile = (filename) => {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath))
            return null;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            fs.renameSync(filePath, `${filePath}.migrated`);
            return data;
        }
        catch {
            return null;
        }
    };
    // Migrate router_state.json
    const routerState = migrateFile('router_state.json');
    if (routerState) {
        if (routerState.last_timestamp) {
            setRouterState('last_timestamp', routerState.last_timestamp);
        }
        if (routerState.last_agent_timestamp) {
            setRouterState('last_agent_timestamp', JSON.stringify(routerState.last_agent_timestamp));
        }
    }
    // Migrate sessions.json
    const sessions = migrateFile('sessions.json');
    if (sessions) {
        for (const [folder, sessionId] of Object.entries(sessions)) {
            setSession(folder, 'claude', sessionId);
        }
    }
    // Migrate registered_groups.json
    const groups = migrateFile('registered_groups.json');
    if (groups) {
        for (const [jid, group] of Object.entries(groups)) {
            setRegisteredGroup(jid, group);
        }
    }
}
export function markMessagesProcessed(msgs) {
    if (!msgs.length)
        return;
    const stmt = db.prepare('INSERT OR IGNORE INTO processed_messages (message_id, chat_jid, processed_at) VALUES (?, ?, ?)');
    const now = new Date().toISOString();
    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            stmt.run(row.id, row.chat_jid, now);
        }
    });
    insertMany(msgs);
}
export function filterUnprocessedMessages(msgs) {
    if (!msgs.length)
        return msgs;
    const processed = db
        .prepare('SELECT message_id, chat_jid FROM processed_messages WHERE message_id IN (' +
        msgs.map(() => '?').join(',') + ')')
        .all(...msgs.map(m => m.id));
    const processedSet = new Set(processed.map(p => `${p.message_id}:${p.chat_jid}`));
    return msgs.filter(m => !processedSet.has(`${m.id}:${m.chat_jid}`));
}
export function pruneProcessedMessages(retentionMs) {
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    const result = db
        .prepare('DELETE FROM processed_messages WHERE processed_at < ?')
        .run(cutoff);
    return result.changes;
}
//# sourceMappingURL=db.js.map