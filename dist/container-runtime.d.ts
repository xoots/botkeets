/**
 * Container runtime utilities - pure functions for container operations
 */
export declare const CONTAINER_RUNTIME_BIN: string;
/**
 * Build readonly mount arguments for container volumes
 */
export declare function readonlyMountArgs(hostPath: string, containerPath: string): string[];
/**
 * Generate container stop command
 */
export declare function stopContainer(name: string): string;
/**
 * Check if container runtime is running
 */
export declare function ensureContainerRuntimeRunning(): void;
/**
 * Clean up orphaned containers
 */
export declare function cleanupOrphans(prefix: string): void;
/**
 * Prewarm container image by running it briefly
 */
export declare function prewarmContainerImage(image: string, count?: number, timeoutMs?: number): void;
declare const _default: {
    CONTAINER_RUNTIME_BIN: string;
    readonlyMountArgs: typeof readonlyMountArgs;
    stopContainer: typeof stopContainer;
    ensureContainerRuntimeRunning: typeof ensureContainerRuntimeRunning;
    cleanupOrphans: typeof cleanupOrphans;
    prewarmContainerImage: typeof prewarmContainerImage;
};
export default _default;
//# sourceMappingURL=container-runtime.d.ts.map