/**
 * CoPaw System — stub implementation (non-MCP functions).
 * MCP client management is file-backed via KEET_MCP_CONFIG_PATH.
 * All other functions return safe no-op defaults; authority always reports 'legacy'.
 */
export interface CoPawMcpClientInfo {
    key: string;
    name: string;
    enabled: boolean;
    transport: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    health?: string;
}
export interface KeetMcpAdapterState {
    enabled_clients: CoPawMcpClientInfo[];
    warnings: string[];
    summary: string;
}
export interface KeetMcpApiExecutionResult {
    handled: boolean;
    success: boolean;
    output: string;
    client_key?: string;
}
export interface SdkMcpServerConfig {
    type?: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
}
export interface CoPawActiveModelsInfo {
    [slot: string]: string;
}
export interface CoPawModelSlotRequest {
    slot?: string;
    model: string;
    provider?: string;
    provider_id?: string;
}
export declare function resolveEffectiveOllamaBaseUrl(legacyBaseUrl: string): {
    base_url: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
export declare function resolveEffectiveOllamaModel(legacyModel: string): {
    model: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
export declare function resolveEffectiveProviderModel(_providerId: string, legacyModel: string): {
    model: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
export declare function resolveEffectiveProviderCredential(_providerId: string, legacyApiKey: string, legacyBaseUrl?: string): {
    api_key: string;
    base_url: string;
    authority: 'copaw' | 'legacy';
    warnings: string[];
};
export declare function validateKeetExecutionReadiness(mode: 'eco' | 'standard' | 'pro' | 'auto'): {
    ok: boolean;
    errors: string[];
    warnings: string[];
    mode: 'eco' | 'standard' | 'pro' | 'auto';
};
export declare function readCoPawMemoryRecord(opts: {
    legacyPath?: string;
    [k: string]: unknown;
}): {
    content: string;
};
export declare function getCoPawActiveModels(): CoPawActiveModelsInfo;
export declare function setCoPawActiveModels(_req: CoPawModelSlotRequest): CoPawActiveModelsInfo;
export declare function getCoPawProviderDiagnostics(): {
    active_llm: {
        authority: 'legacy';
    };
};
export declare function getKeetMcpAdapterState(): Promise<KeetMcpAdapterState>;
export declare function listCoPawMcpClients(): CoPawMcpClientInfo[];
export declare function listCoPawMcpClientsWithHealth(): Promise<CoPawMcpClientInfo[]>;
export declare function getCoPawMcpClient(key: string): CoPawMcpClientInfo;
export declare function createCoPawMcpClient(cfg: Partial<CoPawMcpClientInfo>): CoPawMcpClientInfo;
export declare function updateCoPawMcpClient(key: string, patch: Partial<CoPawMcpClientInfo>): CoPawMcpClientInfo;
export declare function toggleCoPawMcpClient(key: string): CoPawMcpClientInfo;
export declare function deleteCoPawMcpClient(key: string): {
    deleted: boolean;
};
export declare function executeKeetMcpApiStep(_desc: string | Record<string, unknown>): Promise<KeetMcpApiExecutionResult>;
export declare function getEnabledMcpServersForSdk(): Record<string, SdkMcpServerConfig>;
export declare function getCoPawWorkspaceStatus(): Record<string, unknown>;
export declare function listCoPawProviders(): string[];
export declare function listCoPawSkills(): string[];
//# sourceMappingURL=copaw-system.d.ts.map