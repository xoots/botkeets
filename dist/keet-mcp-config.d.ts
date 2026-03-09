/**
 * Deprecated compatibility bridge.
 *
 * KEET MCP runtime authority now comes from CoPaw's shared MCP manager.
 * Keep this module as a thin re-export layer for legacy imports.
 */
import { getEnabledMcpServersForSdk, type CoPawMcpClientInfo, type KeetMcpAdapterState, type KeetMcpApiExecutionResult } from './copaw-system.js';
export { getEnabledMcpServersForSdk };
export type KeetMcpClientInfo = CoPawMcpClientInfo;
export type { KeetMcpAdapterState, KeetMcpApiExecutionResult };
export declare function listKeetMcpClients(): KeetMcpClientInfo[];
export declare function listKeetMcpClientsWithHealth(): Promise<KeetMcpClientInfo[]>;
export declare function getKeetMcpAdapterState(): Promise<KeetMcpAdapterState>;
export declare function executeKeetMcpApiStep(description: string): Promise<KeetMcpApiExecutionResult>;
//# sourceMappingURL=keet-mcp-config.d.ts.map