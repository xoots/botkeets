/**
 * Clarification Store
 *
 * Holds pending clarification state per JID so the agent can ask questions,
 * wait for the user's reply (or `!go`), then resume execution.
 *
 * Lifecycle:
 *   1. container-runner generates a plan with clarifications
 *   2. Questions are sent to the user; setPending() is called — execution pauses
 *   3. Next message from that JID enters container-runner
 *   4. hasPending() returns true → parseAnswers() extracts answers from the reply
 *   5. runTask() is called with answers; clearPending() is called
 *   6. If the user sends `!go` (or after TTL), we proceed with empty answers
 *
 * Persistence: an optional JSON sidecar at <logsDir>/clarification-pending.json
 * is written on every mutation so state survives process restarts.
 */
import fs from 'fs';
import path from 'path';
const PROJECT_ROOT = process.cwd();
const STORE_FILE = path.join(PROJECT_ROOT, 'logs', 'clarification-pending.json');
/** TTL: if the user hasn't answered in 30 minutes, auto-proceed with defaults */
const TTL_MS = 30 * 60 * 1000;
// ── In-memory store ───────────────────────────────────────────────────────────
const _pending = new Map();
// ── Disk persistence ──────────────────────────────────────────────────────────
function persist() {
    try {
        fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
        const obj = {};
        _pending.forEach((v, k) => { obj[k] = v; });
        fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    }
    catch { /* non-fatal */ }
}
function hydrate() {
    try {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const obj = JSON.parse(raw);
        const now = Date.now();
        for (const [k, v] of Object.entries(obj)) {
            // Drop stale entries on load
            if (!v || typeof v.createdAt !== 'number')
                continue;
            if (now - v.createdAt < TTL_MS && v.jid && v.planResult && v.execMode) {
                _pending.set(k, {
                    jid: v.jid,
                    planResult: v.planResult,
                    execMode: v.execMode,
                    vaultKeys: Array.isArray(v.vaultKeys) ? v.vaultKeys : [],
                    createdAt: v.createdAt,
                    ...(v.type != null && { type: v.type }),
                    ...(v.dripFeed != null && { dripFeed: v.dripFeed }),
                    ...(v.noDrip != null && { noDrip: v.noDrip }),
                    ...(v.planMode != null && { planMode: v.planMode }),
                    ...(v.parallelOverride != null && { parallelOverride: v.parallelOverride }),
                    ...(v.planSelections != null && { planSelections: v.planSelections }),
                    ...(v.effectiveMode != null && { effectiveMode: v.effectiveMode }),
                });
            }
        }
    }
    catch { /* file doesn't exist yet */ }
}
// Hydrate once at import time
hydrate();
// ── Public API ────────────────────────────────────────────────────────────────
/** Store a pending clarification for a JID and pause execution. */
export function setPending(jid, entry) {
    _pending.set(jid, { ...entry, createdAt: Date.now() });
    persist();
}
/** True if there is a live (non-expired) pending clarification for this JID. */
export function hasPending(jid) {
    const entry = _pending.get(jid);
    if (!entry)
        return false;
    if (Date.now() - entry.createdAt > TTL_MS) {
        _pending.delete(jid);
        persist();
        return false;
    }
    return true;
}
/** Retrieve the pending clarification (returns null if expired or missing). */
export function getPending(jid) {
    return hasPending(jid) ? (_pending.get(jid) ?? null) : null;
}
/** Update fields on an existing pending entry (e.g. plan UI selections). */
export function updatePending(jid, patch) {
    const entry = _pending.get(jid);
    if (!entry)
        return;
    Object.assign(entry, patch);
    persist();
}
/** Remove the pending clarification (call after execution resumes). */
export function clearPending(jid) {
    _pending.delete(jid);
    persist();
}
// ── Answer parser ─────────────────────────────────────────────────────────────
/**
 * Extract clarification answers from the user's reply message.
 *
 * Tries two formats in order:
 *   1. "id: answer" — one per line (explicit)
 *   2. Free-form — maps each answer line to questions in order
 *
 * `!go` with no content → returns empty answers (use plan defaults).
 */
export function parseAnswers(userText, pending) {
    const answers = {};
    // Strip leading `!go` if present
    const cleaned = userText.replace(/^!go\s*/i, '').trim();
    if (!cleaned)
        return answers; // bare `!go` → proceed with defaults
    const questions = pending.planResult.clarifications;
    const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
    // Try "id: answer" format first
    const idAnswers = lines
        .map((l) => l.match(/^([a-z_\-\d]+):\s*(.+)$/i))
        .filter(Boolean);
    if (idAnswers.length > 0) {
        for (const m of idAnswers) {
            answers[m[1]] = m[2].trim();
        }
        return answers;
    }
    // Free-form: map lines to question IDs by position
    for (let i = 0; i < Math.min(lines.length, questions.length); i++) {
        answers[questions[i].id] = lines[i];
    }
    return answers;
}
//# sourceMappingURL=clarification-store.js.map