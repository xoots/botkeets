export const LIVE_CONTROL_ROUTE_CONTRACT = [
    { method: 'GET', path: '/api/health', authRequired: false, live: true },
    { method: 'GET', path: '/api/services', authRequired: false, live: true },
    { method: 'GET', path: '/api/readiness', authRequired: false, live: true },
    { method: 'GET', path: '/api/metrics/routing', authRequired: false, live: true },
    { method: 'GET', path: '/api/metrics/sqlite', authRequired: false, live: true },
    { method: 'GET', path: '/api/metrics/step-routing', authRequired: false, live: true },
    { method: 'GET', path: '/api/interactions', authRequired: false, live: true },
    { method: 'GET', path: '/api/keet/mcp', authRequired: false, live: true },
    { method: 'GET', path: '/api/tasks', authRequired: false, live: true },
    { method: 'GET', path: '/api/tasks/:id', authRequired: false, live: true },
    { method: 'GET', path: '/api/approvals/pending', authRequired: false, live: true },
    { method: 'GET', path: '/api/budgets', authRequired: false, live: true },
    { method: 'POST', path: '/api/budgets', authRequired: true, live: true },
    { method: 'GET', path: '/api/budgets/usage', authRequired: false, live: true },
    { method: 'GET', path: '/api/tasks/:id/budget', authRequired: false, live: true },
    { method: 'POST', path: '/api/tasks/:id/budget', authRequired: true, live: true },
    { method: 'POST', path: '/api/tasks/:id/pro-shard/approve', authRequired: true, live: true },
    { method: 'GET', path: '/api/metrics/cost-guards', authRequired: false, live: true },
    { method: 'GET', path: '/api/metrics/runtime-split', authRequired: false, live: true },
    { method: 'POST', path: '/api/runtime/shell/action', authRequired: true, live: true },
    { method: 'POST', path: '/api/mode', authRequired: true, live: true },
    {
        method: 'POST',
        path: '/api/services/:name/:action',
        authRequired: true,
        live: true,
        notes: 'name in {keet, keet-classifier}; action in {start, stop, restart}',
    },
];
export const NON_LIVE_CONTROL_ROUTES = [
    { method: 'GET', path: '/api/copaw/health', state: 'stubbed_migration_error', notes: 'Removed after CoPaw authority migration.' },
    { method: 'GET', path: '/api/metrics/copaw', state: 'stubbed_migration_error', notes: 'Removed after CoPaw authority migration.' },
    { method: 'GET', path: '/api/copaw/runs', state: 'stubbed_migration_error', notes: 'Removed after CoPaw authority migration.' },
    { method: 'POST', path: '/api/copaw/circuit/reset', state: 'stubbed_migration_error', notes: 'Removed after CoPaw authority migration.' },
    { method: 'POST', path: '/api/copaw/config', state: 'stubbed_migration_error', notes: 'Removed after CoPaw authority migration.' },
    { method: 'GET', path: '/api/copaw/providers', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw provider adapter surface.' },
    { method: 'GET', path: '/api/copaw/active-models', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw active-model adapter surface.' },
    { method: 'GET', path: '/api/copaw/mcp', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw MCP adapter surface.' },
    { method: 'GET', path: '/api/copaw/mcp/:clientKey', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw MCP adapter surface.' },
    { method: 'POST', path: '/api/copaw/mcp', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw MCP adapter surface.' },
    { method: 'PUT', path: '/api/copaw/mcp/:clientKey', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw MCP adapter surface.' },
    { method: 'POST', path: '/api/copaw/mcp/:clientKey/toggle', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw MCP adapter surface.' },
    { method: 'DELETE', path: '/api/copaw/mcp/:clientKey', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw MCP adapter surface.' },
    { method: 'GET', path: '/api/copaw/skills', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw skills adapter surface.' },
    { method: 'GET', path: '/api/copaw/workspace/status', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw workspace adapter surface.' },
    { method: 'GET', path: '/api/copaw/ui/state', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw UI adapter surface.' },
    { method: 'POST', path: '/api/copaw/ui/action', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw UI adapter surface.' },
    { method: 'GET', path: '/api/copaw-agent/health', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw agent adapter surface.' },
    { method: 'GET', path: '/api/copaw-agent/capabilities', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw agent adapter surface.' },
    { method: 'GET', path: '/api/copaw-agent/sessions', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw agent adapter surface.' },
    { method: 'POST', path: '/api/copaw-agent/sessions', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw agent adapter surface.' },
    { method: 'POST', path: '/api/copaw-agent/chat', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the CoPaw agent adapter surface.' },
    { method: 'POST', path: '/api/trigger/dag/run', state: 'standalone_adapter_disabled', notes: 'Standalone builds do not expose the Trigger DAG adapter surface.' },
];
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function routePathToRegex(pathTemplate) {
    const pattern = pathTemplate
        .split('/')
        .map((part) => {
        if (!part)
            return '';
        return part.startsWith(':') ? '[^/]+' : escapeRegex(part);
    })
        .join('/');
    return new RegExp(`^${pattern}$`);
}
export function matchNonLiveControlRoute(method, pathname) {
    if (!method)
        return null;
    return NON_LIVE_CONTROL_ROUTES.find((route) => {
        if (route.method !== method)
            return false;
        return routePathToRegex(route.path).test(pathname);
    }) ?? null;
}
export function buildNonLiveControlRouteResponse(route, migrationPhase) {
    if (route.state === 'standalone_adapter_disabled') {
        return {
            status: 410,
            body: {
                error: 'endpoint_disabled_in_standalone',
                code: 'standalone_adapter_disabled',
                method: route.method,
                path: route.path,
                message: route.notes,
            },
        };
    }
    return {
        status: 410,
        body: {
            error: 'endpoint_removed_for_migration',
            code: 'copaw_migration_removed_endpoint',
            method: route.method,
            path: route.path,
            phase: migrationPhase,
            message: 'This endpoint was removed after CoPaw migration. Use the live control route contract.',
        },
    };
}
//# sourceMappingURL=control-route-contract.js.map