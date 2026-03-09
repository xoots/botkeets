import { execSync } from 'child_process';
import { logger } from './logger.js';
const CONTAINER_RUNTIME_BIN = 'docker';
export class DockerContainerRuntime {
    ensureRunning() {
        try {
            execSync(`${CONTAINER_RUNTIME_BIN} info`, { stdio: 'pipe', timeout: 10000 });
            logger.debug('Docker runtime already running');
        }
        catch {
            logger.error('Docker runtime not running. Please start Docker.');
            throw new Error('Docker runtime is required but not running');
        }
    }
    cleanupOrphans(prefix) {
        try {
            const output = execSync(`${CONTAINER_RUNTIME_BIN} ps -a --filter name=^/${prefix} --format '{{.Names}}'`, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
            const orphans = output.trim().split('\n').filter(Boolean);
            for (const name of orphans) {
                try {
                    execSync(this.stopContainer(name), { stdio: 'pipe' });
                    execSync(`${CONTAINER_RUNTIME_BIN} rm ${name}`, { stdio: 'pipe' });
                }
                catch { /* ignore */ }
            }
            if (orphans.length > 0) {
                logger.info({ count: orphans.length, names: orphans }, 'Removed orphaned Docker containers');
            }
        }
        catch (err) {
            logger.warn({ err }, 'Failed to clean up orphaned Docker containers');
        }
    }
    prewarmImage(image, count = 1, timeoutMs = 20000) {
        if (!image || count <= 0)
            return;
        let warmed = 0;
        for (let i = 0; i < count; i++) {
            try {
                execSync(`${CONTAINER_RUNTIME_BIN} pull ${image}`, { stdio: 'pipe', timeout: timeoutMs });
                warmed += 1;
            }
            catch (err) {
                logger.warn({ err, image }, 'Docker image prewarm attempt failed');
            }
        }
        if (warmed > 0) {
            logger.info({ image, warmed, requested: count }, 'Docker image prewarm complete');
        }
    }
    stopContainer(name) {
        return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
    }
    getRunCommand(name, image, command, mounts, envVars, ports, workingDir, extraArgs) {
        const args = [
            'run',
            '-i',
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
export const dockerContainerRuntime = new DockerContainerRuntime();
//# sourceMappingURL=docker-container-runtime.js.map