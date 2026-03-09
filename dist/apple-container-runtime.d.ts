import type { ContainerEnvVars, ContainerMount, ContainerRuntime } from './container-runtime-interface.js';
export declare class AppleContainerRuntime implements ContainerRuntime {
    ensureRunning(): void;
    cleanupOrphans(prefix: string): void;
    prewarmImage(image: string, count?: number, timeoutMs?: number): void;
    stopContainer(name: string): string;
    getRunCommand(name: string, image: string, command: string[], mounts: ContainerMount[], envVars: ContainerEnvVars, ports: {
        hostPort: number;
        containerPort: number;
    }[], workingDir: string, extraArgs: string[]): {
        command: string;
        args: string[];
    };
}
export declare const appleContainerRuntime: AppleContainerRuntime;
//# sourceMappingURL=apple-container-runtime.d.ts.map