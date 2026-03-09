import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
const AUDIT_FILE = path.join(process.cwd(), 'logs', 'infra-authority-audit.jsonl');
function stablePayload(event) {
    return JSON.stringify(event);
}
function hashPayload(payload) {
    return crypto.createHash('sha256').update(payload).digest('hex');
}
function readLastHash(file = AUDIT_FILE) {
    try {
        const text = fs.readFileSync(file, 'utf-8');
        const lines = text.trim().split('\n').filter(Boolean);
        if (lines.length === 0)
            return null;
        const last = JSON.parse(lines[lines.length - 1]);
        return typeof last.hash === 'string' ? last.hash : null;
    }
    catch {
        return null;
    }
}
export function emitAuditDecision(event) {
    const prevHash = readLastHash();
    const baseEvent = {
        ts: new Date().toISOString(),
        actor: event.actor,
        action: event.action,
        target: event.target,
        allowed: event.allowed,
        reason: event.reason,
        details: event.details,
        prev_hash: prevHash,
    };
    const hash = hashPayload(stablePayload(baseEvent));
    const persisted = {
        ...baseEvent,
        hash,
    };
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(persisted)}\n`, 'utf-8');
    return persisted;
}
export function readAuthorityAuditEvents(file = AUDIT_FILE) {
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        return raw
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}
export function validateAuthorityAuditIntegrity(file = AUDIT_FILE) {
    const events = readAuthorityAuditEvents(file);
    let prevHash = null;
    for (const event of events) {
        if (event.prev_hash !== prevHash)
            return false;
        const { hash, ...withoutHash } = event;
        const computed = hashPayload(stablePayload(withoutHash));
        if (hash !== computed)
            return false;
        prevHash = hash;
    }
    return true;
}
//# sourceMappingURL=audit-pipeline.js.map