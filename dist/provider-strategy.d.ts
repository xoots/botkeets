export declare function isRateLimitError(text: string): boolean;
export declare function isContextOverflowError(text: string): boolean;
export declare function isProviderUnavailableError(text: string): boolean;
export declare function isProviderActive(groupFolder: string, entry: string): boolean;
export declare function deactivateProvider(groupFolder: string, entry: string, durationMs?: number): void;
export declare function selectActiveProvider(groupFolder: string, chain?: string[]): {
    provider: string;
    activeChain: string[];
};
export declare function isOllamaAvailable(): boolean;
export declare function buildRuntimeContextMd(groupFolder: string, provider: string, activeChain: string[], extras?: Record<string, string>): string;
//# sourceMappingURL=provider-strategy.d.ts.map