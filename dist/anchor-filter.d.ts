import type { Mode } from './mode-manager.js';
type AnchorMode = Mode | 'local';
export interface AnchorContext {
    anchorContent: string;
    userContext: string;
    totalTokens: number;
    capTokens: number;
    capRespected: boolean;
    mode: AnchorMode;
}
export declare function loadAnchor(mode: AnchorMode): AnchorContext;
export {};
//# sourceMappingURL=anchor-filter.d.ts.map