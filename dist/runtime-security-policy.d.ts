import type { ContainerMount } from './container-runtime-interface.js';
export declare function sanitizeSecretEnvMap(input: Record<string, string | undefined>): Record<string, string>;
export declare function sanitizeRuntimeMounts(mounts: ContainerMount[]): ContainerMount[];
export declare function resolveWorkspaceBoundPath(requestedPath: string, workspaceDir?: string): string | null;
export declare function resolveSafeWorkspacePath(requestedPath: string, workspaceDir?: string): string | null;
//# sourceMappingURL=runtime-security-policy.d.ts.map