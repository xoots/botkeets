import type { ModelTier, ModelCategory, WarmthTier, AssembledAnchor } from './memory-types.js';
import type { Mode } from './mode-manager.js';
export interface AnchorAssemblyInput {
    modelTier: ModelTier;
    warmth: WarmthTier;
    canonScore: number;
    projectId: string | null;
    canonicalSummary: string;
    cogneeChunks: string[];
    sessionId: string;
}
export declare function resolveModelTier(mode: Mode): ModelTier;
export declare function resolveModelCategory(tier: ModelTier): ModelCategory;
/** Returns the absolute token cap for memory anchors given a model tier. */
export declare function computeContextCap(tier: ModelTier): number;
export declare const ANCHOR_TOKEN_BUDGETS: Record<string, {
    project_summary: number;
    cognee_chunks: number;
}>;
export declare function resolveWarmthTier(score: number): WarmthTier;
export declare function assembleAnchor(input: AnchorAssemblyInput): AssembledAnchor;
export declare function computeFullHotBaselineCost(mode: Mode, canonicalSummary: string): number;
//# sourceMappingURL=memory-anchor-builder.d.ts.map