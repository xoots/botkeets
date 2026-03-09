export const FIXED_IMAGE_ENTRYPOINT = '/app/entrypoint.sh';
export const FIXED_BASE_MOUNT_TARGETS = [
    '/workspace/group',
    '/workspace/ipc',
    '/home/node/.claude',
];
export const FIXED_MAIN_WORKSPACE_TARGET = '/workspace/project';
export const FIXED_NON_MAIN_WORKSPACE_TARGET = '/workspace/global';
export function buildFixedContainerMounts(input) {
    const mounts = [
        { hostPath: input.groupDir, containerPath: FIXED_BASE_MOUNT_TARGETS[0], readonly: false },
        { hostPath: input.ipcDir, containerPath: FIXED_BASE_MOUNT_TARGETS[1], readonly: false },
        { hostPath: input.sessionDir, containerPath: FIXED_BASE_MOUNT_TARGETS[2], readonly: false },
    ];
    if (input.isMain) {
        mounts.push({
            hostPath: input.projectRoot,
            containerPath: FIXED_MAIN_WORKSPACE_TARGET,
            readonly: false,
        });
    }
    else {
        mounts.push({
            hostPath: input.globalGroupDir,
            containerPath: FIXED_NON_MAIN_WORKSPACE_TARGET,
            readonly: true,
        });
    }
    return mounts;
}
//# sourceMappingURL=container-execution-contract.js.map