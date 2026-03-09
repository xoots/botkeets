import { describe, expect, it } from 'vitest';
import { LIVE_CONTROL_ROUTE_CONTRACT, NON_LIVE_CONTROL_ROUTES, buildNonLiveControlRouteResponse, matchNonLiveControlRoute, } from '../control-route-contract.js';
describe('standalone control route contract', () => {
    it('does not advertise non-live CoPaw or Trigger routes as live', () => {
        const livePaths = new Set(LIVE_CONTROL_ROUTE_CONTRACT.map((route) => `${route.method} ${route.path}`));
        for (const route of NON_LIVE_CONTROL_ROUTES) {
            expect(livePaths.has(`${route.method} ${route.path}`)).toBe(false);
        }
    });
    it('matches parameterized non-live routes', () => {
        expect(matchNonLiveControlRoute('GET', '/api/copaw/mcp/client-123')).toMatchObject({
            method: 'GET',
            path: '/api/copaw/mcp/:clientKey',
            state: 'standalone_adapter_disabled',
        });
    });
    it('returns standalone-disabled stubs for disabled adapter surfaces', () => {
        const route = matchNonLiveControlRoute('POST', '/api/trigger/dag/run');
        expect(route).toBeTruthy();
        const response = buildNonLiveControlRouteResponse(route, 'copaw-only');
        expect(response).toEqual({
            status: 410,
            body: {
                error: 'endpoint_disabled_in_standalone',
                code: 'standalone_adapter_disabled',
                method: 'POST',
                path: '/api/trigger/dag/run',
                message: 'Standalone builds do not expose the Trigger DAG adapter surface.',
            },
        });
    });
    it('returns migration-removed stubs for retired routes', () => {
        const route = matchNonLiveControlRoute('GET', '/api/copaw/health');
        expect(route).toBeTruthy();
        const response = buildNonLiveControlRouteResponse(route, 'copaw-write-warn-legacy-read');
        expect(response).toEqual({
            status: 410,
            body: {
                error: 'endpoint_removed_for_migration',
                code: 'copaw_migration_removed_endpoint',
                method: 'GET',
                path: '/api/copaw/health',
                phase: 'copaw-write-warn-legacy-read',
                message: 'This endpoint was removed after CoPaw migration. Use the live control route contract.',
            },
        });
    });
});
//# sourceMappingURL=standalone-contract.test.js.map