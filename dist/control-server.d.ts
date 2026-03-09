export { LIVE_CONTROL_ROUTE_CONTRACT, NON_LIVE_CONTROL_ROUTES, buildNonLiveControlRouteResponse, matchNonLiveControlRoute, } from './control-route-contract.js';
export declare function isAuthorizedMutatingRequest(adminToken: string, headerToken: string | undefined): boolean;
export declare function isExistingControlServerHealthy(fetchImpl?: typeof fetch): Promise<boolean>;
export declare function startControlServer(): void;
//# sourceMappingURL=control-server.d.ts.map