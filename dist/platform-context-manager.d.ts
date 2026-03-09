import { getSession, setSession } from './db.js';
import { createProject, type ProjectWorkspace } from './project-workspace.js';
interface LeaseMetadata {
    leaseId: string;
    namespace: string;
    createdAt: number;
    expiresAt: number;
}
export interface WorkspaceLeaseLimits {
    leaseTtlMs: number;
    maxSubtasks: number;
    maxClarifications: number;
}
export interface SessionLeaseLimits {
    leaseTtlMs: number;
    maxTurns: number;
}
export interface WorkspaceContextHandle extends LeaseMetadata {
    kind: 'workspace';
    workspace: ProjectWorkspace;
    limits: Readonly<WorkspaceLeaseLimits>;
}
export interface SessionContextHandle extends LeaseMetadata {
    kind: 'session';
    scope: Readonly<{
        groupFolder: string;
        provider: string;
    }>;
    sessionId: string | null;
    limits: Readonly<SessionLeaseLimits>;
}
export interface LeaseWorkspaceRequest {
    namespace: string;
    taskDescription: string;
    limits?: Partial<WorkspaceLeaseLimits>;
}
export interface AdoptWorkspaceRequest {
    namespace: string;
    workspace: ProjectWorkspace;
    limits?: Partial<WorkspaceLeaseLimits>;
}
export interface LeaseSessionRequest {
    namespace: string;
    groupFolder: string;
    provider: string;
    preferredSessionId?: string;
    limits?: Partial<SessionLeaseLimits>;
}
export interface PlatformContextManagerDeps {
    nowImpl: () => number;
    storePath: string;
    createWorkspaceImpl: typeof createProject;
    getSessionImpl: typeof getSession;
    setSessionImpl: typeof setSession;
}
export declare class PlatformContextManager {
    private readonly deps;
    private readonly workspaces;
    private readonly sessions;
    private readonly sessionIndex;
    constructor(deps?: Partial<PlatformContextManagerDeps>);
    leaseWorkspaceContext(req: LeaseWorkspaceRequest): WorkspaceContextHandle;
    adoptWorkspaceContext(req: AdoptWorkspaceRequest): WorkspaceContextHandle;
    resolveWorkspaceContext(leaseId: string): WorkspaceContextHandle | null;
    releaseWorkspaceContext(leaseId: string): boolean;
    leaseSessionContext(req: LeaseSessionRequest): SessionContextHandle;
    bindSessionContext(leaseId: string, sessionId: string): SessionContextHandle | null;
    resolveSessionContext(leaseId: string): SessionContextHandle | null;
    releaseSessionContext(leaseId: string): boolean;
    cleanupExpiredLeases(): {
        workspaceLeaseIds: string[];
        sessionLeaseIds: string[];
    };
    getActiveWorkspaceLeaseCount(): number;
    getActiveSessionLeaseCount(): number;
    private hydrate;
    private persist;
}
export declare const platformContextManager: PlatformContextManager;
export {};
//# sourceMappingURL=platform-context-manager.d.ts.map