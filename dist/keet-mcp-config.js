/**
 * Deprecated compatibility bridge.
 *
 * KEET MCP runtime authority now comes from CoPaw's shared MCP manager.
 * Keep this module as a thin re-export layer for legacy imports.
 */
import { executeKeetMcpApiStep as executeKeetMcpApiStepFromCoPaw, getKeetMcpAdapterState as getKeetMcpAdapterStateFromCoPaw, getEnabledMcpServersForSdk, listCoPawMcpClients, listCoPawMcpClientsWithHealth, } from './copaw-system.js';
export { getEnabledMcpServersForSdk };
export function listKeetMcpClients() {
    return listCoPawMcpClients();
}
export async function listKeetMcpClientsWithHealth() {
    return listCoPawMcpClientsWithHealth();
}
export async function getKeetMcpAdapterState() {
    return getKeetMcpAdapterStateFromCoPaw();
}
export async function executeKeetMcpApiStep(description) {
    return executeKeetMcpApiStepFromCoPaw(description);
}
//# sourceMappingURL=keet-mcp-config.js.map