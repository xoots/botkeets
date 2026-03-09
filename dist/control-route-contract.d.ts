export type ControlRouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export interface ControlRouteDefinition {
    method: ControlRouteMethod;
    path: string;
    authRequired: boolean;
    live: true;
    notes?: string;
}
export declare const LIVE_CONTROL_ROUTE_CONTRACT: ControlRouteDefinition[];
export interface NonLiveRouteDefinition {
    method: ControlRouteMethod;
    path: string;
    state: 'stubbed_migration_error' | 'standalone_adapter_disabled';
    notes: string;
}
export declare const NON_LIVE_CONTROL_ROUTES: NonLiveRouteDefinition[];
export type NonLiveControlRouteResponse = {
    status: 410;
    body: {
        error: 'endpoint_disabled_in_standalone';
        code: 'standalone_adapter_disabled';
        method: ControlRouteMethod;
        path: string;
        message: string;
    };
} | {
    status: 410;
    body: {
        error: 'endpoint_removed_for_migration';
        code: 'copaw_migration_removed_endpoint';
        method: ControlRouteMethod;
        path: string;
        phase: string;
        message: string;
    };
};
export declare function matchNonLiveControlRoute(method: string | undefined, pathname: string): NonLiveRouteDefinition | null;
export declare function buildNonLiveControlRouteResponse(route: NonLiveRouteDefinition, migrationPhase: string): NonLiveControlRouteResponse;
//# sourceMappingURL=control-route-contract.d.ts.map