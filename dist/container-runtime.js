/**
 * Container runtime utilities - pure functions for container operations
 */
export const CONTAINER_RUNTIME_BIN = process.env.CONTAINER_RUNTIME_TYPE === 'docker' ? 'docker' : 'container';
/**
 * Build readonly mount arguments for container volumes
 */
export function readonlyMountArgs(hostPath, containerPath) {
    return ['-v', `${hostPath}:${containerPath}:ro`];
}
/**
 * Generate container stop command
 */
export function stopContainer(name) {
    return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
}
/**
 * Check if container runtime is running
 */
export function ensureContainerRuntimeRunning() {
    const { execSync } = require('child_process');
    try {
        execSync(`${CONTAINER_RUNTIME_BIN} info`, { stdio: 'pipe', timeout: 10000 });
    }
    catch (error) {
        throw new Error('Container runtime is required but failed to start');
    }
}
/**
 * Clean up orphaned containers
 */
export function cleanupOrphans(prefix) {
    const { execSync } = require('child_process');
    try {
        const output = execSync(`${CONTAINER_RUNTIME_BIN} ps -a --filter name=^/${prefix} --format '{{.Names}}'`, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
        const containerNames = output.trim().split('\n').filter((name) => name.trim());
        for (const name of containerNames) {
            try {
                execSync(stopContainer(name), { stdio: 'pipe' });
            }
            catch {
                // Container already stopped or doesn't exist
            }
        }
    }
    catch {
        // Ignore errors during cleanup
    }
}
/**
 * Prewarm container image by running it briefly
 */
export function prewarmContainerImage(image, count = 1, timeoutMs = 20000) {
    const { execSync } = require('child_process');
    for (let i = 0; i < count; i++) {
        try {
            execSync(`${CONTAINER_RUNTIME_BIN} run --rm ${image} /bin/true`, { stdio: 'pipe', timeout: timeoutMs });
        }
        catch {
            try {
                // Fallback to /usr/bin/true
                execSync(`${CONTAINER_RUNTIME_BIN} run --rm ${image} /usr/bin/true`, { stdio: 'pipe', timeout: timeoutMs });
            }
            catch {
                // Ignore prewarm failures
            }
        }
    }
}
export default {
    CONTAINER_RUNTIME_BIN,
    readonlyMountArgs,
    stopContainer,
    ensureContainerRuntimeRunning,
    cleanupOrphans,
    prewarmContainerImage
};
//# sourceMappingURL=container-runtime.js.map