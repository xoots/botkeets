import type { ContainerMount } from './container-runtime-interface.js';
export declare const FIXED_IMAGE_ENTRYPOINT = "/app/entrypoint.sh";
export declare const FIXED_BASE_MOUNT_TARGETS: readonly ["/workspace/group", "/workspace/ipc", "/home/node/.claude"];
export declare const FIXED_MAIN_WORKSPACE_TARGET = "/workspace/project";
export declare const FIXED_NON_MAIN_WORKSPACE_TARGET = "/workspace/global";
export declare function buildFixedContainerMounts(input: {
    groupDir: string;
    ipcDir: string;
    sessionDir: string;
    projectRoot: string;
    globalGroupDir: string;
    isMain: boolean;
}): ContainerMount[];
//# sourceMappingURL=container-execution-contract.d.ts.map