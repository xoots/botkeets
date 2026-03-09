export interface ContainerMount {
    hostPath: string;
    containerPath: string;
    readonly: boolean;
}
export type ContainerEnvVars = Record<string, string>;
export interface ContainerRuntime {
    ensureRunning(): void;
    cleanupOrphans(prefix: string): void;
    prewarmImage(image: string, count: number, timeoutMs: number): void;
    stopContainer(name: string): string;
    getRunCommand(name: string, image: string, command: string[], mounts: ContainerMount[], envVars: ContainerEnvVars, ports: {
        hostPort: number;
        containerPort: number;
    }[], workingDir: string, extraArgs: string[]): {
        command: string;
        args: string[];
    };
}
//# sourceMappingURL=container-runtime-interface.d.ts.map