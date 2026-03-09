import type { ContainerMount } from './container-runtime-interface.js';
export declare function normalizeHostMountPath(hostPath: string): string;
export declare function normalizeContainerMountPath(containerPath: string): string;
export declare function validateSandboxMounts(mounts: ContainerMount[]): ContainerMount[];
//# sourceMappingURL=validate-sandbox-security.d.ts.map