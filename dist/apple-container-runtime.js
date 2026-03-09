import { execSync } from 'child_process';
import { logger } from './logger.js';
/** The container runtime binary name. */
const CONTAINER_RUNTIME_BIN = 'container';
export class AppleContainerRuntime {
    ensureRunning() {
        try {
            execSync(`${CONTAINER_RUNTIME_BIN} list`, { stdio: 'pipe', timeout: 10000 });
            logger.debug('Apple Container runtime already running');
        }
        catch {
            logger.warn('Apple Container runtime not responding, attempting to start it...');
            try {
                execSync(`${CONTAINER_RUNTIME_BIN} system start`, { stdio: 'pipe', timeout: 30000 });
                execSync(`${CONTAINER_RUNTIME_BIN} list`, { stdio: 'pipe', timeout: 10000 });
                logger.info('Apple Container runtime started successfully');
            }
            catch (err) {
                logger.error({ err }, 'Failed to reach Apple Container runtime');
                throw new Error('Apple Container runtime is required but failed to start');
            }
        }
    }
    cleanupOrphans(prefix) {
        try {
            const output = execSync(`${CONTAINER_RUNTIME_BIN} ps --filter name=${prefix} --format '{{.Names}}'`, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
            const orphans = output.trim().split('\n').filter(Boolean);
            for (const name of orphans) {
                try {
                    execSync(this.stopContainer(name), { stdio: 'pipe' });
                }
                catch { /* already stopped */ }
            }
            if (orphans.length > 0) {
                logger.info({ count: orphans.length, names: orphans }, 'Stopped orphaned containers');
            }
        }
        catch (err) {
            logger.warn({ err }, 'Failed to clean up orphaned containers');
        }
    }
    prewarmImage(image, count = 1, timeoutMs = 20000) {
        if (!image || count <= 0)
            return;
        let warmed = 0;
        for (let i = 0; i < count; i++) {
            try {
                // Use a simple shell sleep command that doesn't trigger agent logic
                execSync(`${CONTAINER_RUNTIME_BIN} run --rm ${image} sh -c "sleep 0.1 && exit 0"`, { stdio: 'ignore', timeout: timeoutMs });
                warmed += 1;
            }
            catch (err) {
                logger.warn({ err, image }, 'Container prewarm attempt failed');
                // Don't try alternative commands - pre-warm is optional
                break;
            }
        }
        if (warmed > 0) {
            logger.info({ image, warmed, requested: count }, 'Container image prewarm complete');
        }
        else {
            logger.debug('Container prewarm skipped or failed - continuing without prewarming');
        }
    }
    stopContainer(name) {
        return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
    }
    getRunCommand(name, image, command, mounts, envVars, ports, workingDir, extraArgs) {
        const args = [
            'run',
            '-i', // Keep stdin open so the entrypoint's `cat > /tmp/input.json` receives data
            '--rm',
            `--name=${name}`,
        ];
        if (workingDir) {
            args.push('-w', workingDir);
        }
        for (const mount of mounts) {
            args.push('-v', `${mount.hostPath}:${mount.containerPath}${mount.readonly ? ':ro' : ''}`);
        }
        for (const key of Object.keys(envVars).sort()) {
            args.push('-e', `${key}=${envVars[key]}`);
        }
        for (const port of ports) {
            args.push('-p', `${port.hostPort}:${port.containerPort}`);
        }
        args.push(...extraArgs);
        args.push(image);
        args.push(...command);
        return { command: CONTAINER_RUNTIME_BIN, args };
    }
}
export const appleContainerRuntime = new AppleContainerRuntime();
//# sourceMappingURL=apple-container-runtime.js.map