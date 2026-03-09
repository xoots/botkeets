import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getSession, setSession } from './db.js';
import { logger } from './logger.js';
import { createProject } from './project-workspace.js';
const DEFAULT_WORKSPACE_LIMITS = {
    leaseTtlMs: 12 * 60 * 60 * 1000,
    maxSubtasks: 12,
    maxClarifications: 3,
};
const DEFAULT_SESSION_LIMITS = {
    leaseTtlMs: 2 * 60 * 60 * 1000,
    maxTurns: 200,
};
function sanitizeNamespace(namespace) {
    const sanitized = namespace.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return sanitized || 'default';
}
function freezeWorkspaceHandle(record) {
    return Object.freeze({
        ...record,
        limits: Object.freeze({ ...record.limits }),
        workspace: Object.freeze({ ...record.workspace }),
    });
}
function freezeSessionHandle(record) {
    return Object.freeze({
        ...record,
        limits: Object.freeze({ ...record.limits }),
        scope: Object.freeze({ ...record.scope }),
    });
}
function sessionScopeKey(namespace, groupFolder, provider) {
    return `${namespace}:${groupFolder}:${provider}`;
}
export class PlatformContextManager {
    deps;
    workspaces = new Map();
    sessions = new Map();
    sessionIndex = new Map();
    constructor(deps = {}) {
        this.deps = {
            nowImpl: () => Date.now(),
            storePath: path.join(process.cwd(), 'logs', 'platform-context-leases.json'),
            createWorkspaceImpl: createProject,
            getSessionImpl: getSession,
            setSessionImpl: setSession,
            ...deps,
        };
        this.hydrate();
        this.cleanupExpiredLeases();
    }
    leaseWorkspaceContext(req) {
        const namespace = sanitizeNamespace(req.namespace);
        const now = this.deps.nowImpl();
        const limits = { ...DEFAULT_WORKSPACE_LIMITS, ...(req.limits ?? {}) };
        const workspace = this.deps.createWorkspaceImpl(req.taskDescription, { namespace });
        const leaseId = `${namespace}:ws:${workspace.id}:${randomUUID()}`;
        const record = {
            kind: 'workspace',
            leaseId,
            namespace,
            createdAt: now,
            expiresAt: now + limits.leaseTtlMs,
            limits,
            workspace,
        };
        this.workspaces.set(leaseId, record);
        this.persist();
        return freezeWorkspaceHandle(record);
    }
    adoptWorkspaceContext(req) {
        const namespace = sanitizeNamespace(req.namespace);
        const now = this.deps.nowImpl();
        const limits = { ...DEFAULT_WORKSPACE_LIMITS, ...(req.limits ?? {}) };
        const leaseId = `${namespace}:ws:${req.workspace.id}:${randomUUID()}`;
        const record = {
            kind: 'workspace',
            leaseId,
            namespace,
            createdAt: now,
            expiresAt: now + limits.leaseTtlMs,
            limits,
            workspace: { ...req.workspace, namespace: req.workspace.namespace ?? namespace },
        };
        this.workspaces.set(leaseId, record);
        this.persist();
        return freezeWorkspaceHandle(record);
    }
    resolveWorkspaceContext(leaseId) {
        const record = this.workspaces.get(leaseId);
        if (!record)
            return null;
        if (this.deps.nowImpl() > record.expiresAt) {
            this.workspaces.delete(leaseId);
            this.persist();
            return null;
        }
        return freezeWorkspaceHandle(record);
    }
    releaseWorkspaceContext(leaseId) {
        const deleted = this.workspaces.delete(leaseId);
        if (deleted)
            this.persist();
        return deleted;
    }
    leaseSessionContext(req) {
        const namespace = sanitizeNamespace(req.namespace);
        const now = this.deps.nowImpl();
        const limits = { ...DEFAULT_SESSION_LIMITS, ...(req.limits ?? {}) };
        const key = sessionScopeKey(namespace, req.groupFolder, req.provider);
        const existingLeaseId = this.sessionIndex.get(key);
        if (existingLeaseId) {
            const existing = this.sessions.get(existingLeaseId);
            if (existing && now <= existing.expiresAt) {
                return freezeSessionHandle(existing);
            }
            this.sessions.delete(existingLeaseId);
            this.sessionIndex.delete(key);
        }
        const sessionId = req.preferredSessionId ?? this.deps.getSessionImpl(req.groupFolder, req.provider) ?? null;
        const leaseId = `${namespace}:session:${req.groupFolder}:${req.provider}:${randomUUID()}`;
        const record = {
            kind: 'session',
            leaseId,
            namespace,
            createdAt: now,
            expiresAt: now + limits.leaseTtlMs,
            limits,
            scope: {
                groupFolder: req.groupFolder,
                provider: req.provider,
            },
            sessionId,
        };
        this.sessions.set(leaseId, record);
        this.sessionIndex.set(key, leaseId);
        this.persist();
        return freezeSessionHandle(record);
    }
    bindSessionContext(leaseId, sessionId) {
        const record = this.sessions.get(leaseId);
        if (!record)
            return null;
        record.sessionId = sessionId;
        this.deps.setSessionImpl(record.scope.groupFolder, record.scope.provider, sessionId);
        this.persist();
        return freezeSessionHandle(record);
    }
    resolveSessionContext(leaseId) {
        const record = this.sessions.get(leaseId);
        if (!record)
            return null;
        if (this.deps.nowImpl() > record.expiresAt) {
            const key = sessionScopeKey(record.namespace, record.scope.groupFolder, record.scope.provider);
            this.sessions.delete(leaseId);
            if (this.sessionIndex.get(key) === leaseId) {
                this.sessionIndex.delete(key);
            }
            this.persist();
            return null;
        }
        return freezeSessionHandle(record);
    }
    releaseSessionContext(leaseId) {
        const record = this.sessions.get(leaseId);
        if (!record)
            return false;
        const key = sessionScopeKey(record.namespace, record.scope.groupFolder, record.scope.provider);
        this.sessions.delete(leaseId);
        if (this.sessionIndex.get(key) === leaseId) {
            this.sessionIndex.delete(key);
        }
        this.persist();
        return true;
    }
    cleanupExpiredLeases() {
        const now = this.deps.nowImpl();
        const workspaceLeaseIds = [];
        const sessionLeaseIds = [];
        for (const [leaseId, record] of this.workspaces.entries()) {
            if (now > record.expiresAt) {
                this.workspaces.delete(leaseId);
                workspaceLeaseIds.push(leaseId);
            }
        }
        for (const [leaseId, record] of this.sessions.entries()) {
            if (now > record.expiresAt) {
                const key = sessionScopeKey(record.namespace, record.scope.groupFolder, record.scope.provider);
                this.sessions.delete(leaseId);
                if (this.sessionIndex.get(key) === leaseId) {
                    this.sessionIndex.delete(key);
                }
                sessionLeaseIds.push(leaseId);
            }
        }
        if (workspaceLeaseIds.length > 0 || sessionLeaseIds.length > 0) {
            this.persist();
            logger.info({ workspaceExpired: workspaceLeaseIds.length, sessionExpired: sessionLeaseIds.length }, 'Platform context manager cleaned expired leases');
        }
        return { workspaceLeaseIds, sessionLeaseIds };
    }
    getActiveWorkspaceLeaseCount() {
        return this.workspaces.size;
    }
    getActiveSessionLeaseCount() {
        return this.sessions.size;
    }
    hydrate() {
        try {
            const raw = fs.readFileSync(this.deps.storePath, 'utf-8');
            const parsed = JSON.parse(raw);
            for (const [leaseId, record] of Object.entries(parsed.workspaces ?? {})) {
                this.workspaces.set(leaseId, record);
            }
            for (const [leaseId, record] of Object.entries(parsed.sessions ?? {})) {
                this.sessions.set(leaseId, record);
            }
            for (const [key, leaseId] of Object.entries(parsed.sessionIndex ?? {})) {
                this.sessionIndex.set(key, leaseId);
            }
        }
        catch {
            // no-op: file may not exist yet
        }
    }
    persist() {
        const data = {
            workspaces: Object.fromEntries(this.workspaces.entries()),
            sessions: Object.fromEntries(this.sessions.entries()),
            sessionIndex: Object.fromEntries(this.sessionIndex.entries()),
        };
        fs.mkdirSync(path.dirname(this.deps.storePath), { recursive: true });
        fs.writeFileSync(this.deps.storePath, JSON.stringify(data, null, 2), 'utf-8');
    }
}
export const platformContextManager = new PlatformContextManager();
//# sourceMappingURL=platform-context-manager.js.map