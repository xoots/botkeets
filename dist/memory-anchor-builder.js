import { scanForInjection } from './hardening-schemas.js';
import { logger } from './logger.js';
// Token budget caps per model tier (max tokens the anchor may consume)
const TIER_TOKEN_BUDGET = {
    CLAUDE: 8_000,
    QWEN_MAX: 6_000,
    QWEN_PLUS: 4_000,
    QWEN_CODER: 4_000,
    DEEPSEEK: 3_000,
};
// Warmth multiplier: HOT gets full budget, WARM gets 60%, COLD gets 20%
const WARMTH_MULTIPLIER = {
    HOT: 1.0,
    WARM: 0.6,
    COLD: 0.2,
};
// 4 chars ≈ 1 token (GPT-style rough estimate, avoids tiktoken dependency)
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function truncateToTokens(text, maxTokens) {
    if (estimateTokens(text) <= maxTokens)
        return text;
    // Binary-search the char count that fits within budget
    let lo = 0, hi = text.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (estimateTokens(text.slice(0, mid)) <= maxTokens)
            lo = mid;
        else
            hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd();
}
export function resolveModelTier(mode) {
    switch (mode) {
        case 'pro': return 'CLAUDE';
        case 'standard': return 'QWEN_MAX';
        case 'eco': return 'QWEN_PLUS';
        case 'auto': return 'QWEN_MAX';
    }
}
// Model category: FULL (large context, capable) vs SMALL (constrained, fast)
const MODEL_CATEGORY_MAP = {
    CLAUDE: 'FULL',
    QWEN_MAX: 'FULL',
    DEEPSEEK: 'FULL',
    QWEN_PLUS: 'SMALL',
    QWEN_CODER: 'SMALL',
};
export function resolveModelCategory(tier) {
    return MODEL_CATEGORY_MAP[tier];
}
// Context window sizes per model tier (tokens)
const MODEL_CONTEXT_WINDOW = {
    CLAUDE: 200_000,
    QWEN_MAX: 128_000,
    DEEPSEEK: 128_000,
    QWEN_PLUS: 32_000,
    QWEN_CODER: 32_000,
};
// Maximum share of model context that memory may consume
const CONTEXT_CAP_RATIO = {
    FULL: 0.47,
    SMALL: 0.26,
};
/** Returns the absolute token cap for memory anchors given a model tier. */
export function computeContextCap(tier) {
    const category = resolveModelCategory(tier);
    return Math.floor(MODEL_CONTEXT_WINDOW[tier] * CONTEXT_CAP_RATIO[category]);
}
export const ANCHOR_TOKEN_BUDGETS = {
    'CLAUDE+HOT': { project_summary: 1500, cognee_chunks: 600 },
    'CLAUDE+WARM': { project_summary: 500, cognee_chunks: 0 },
    'CLAUDE+COLD': { project_summary: 0, cognee_chunks: 0 },
    'QWEN_PLUS+HOT': { project_summary: 400, cognee_chunks: 0 },
    'QWEN_PLUS+WARM': { project_summary: 0, cognee_chunks: 0 },
    'QWEN_PLUS+COLD': { project_summary: 0, cognee_chunks: 0 },
    'QWEN_MAX+HOT': { project_summary: 1200, cognee_chunks: 300 },
    'QWEN_MAX+WARM': { project_summary: 500, cognee_chunks: 0 },
    'QWEN_MAX+COLD': { project_summary: 0, cognee_chunks: 0 },
    'DEEPSEEK+HOT': { project_summary: 1000, cognee_chunks: 300 },
    'DEEPSEEK+WARM': { project_summary: 300, cognee_chunks: 0 },
    'DEEPSEEK+COLD': { project_summary: 0, cognee_chunks: 0 },
    'QWEN_CODER+HOT': { project_summary: 800, cognee_chunks: 0 },
    'QWEN_CODER+WARM': { project_summary: 200, cognee_chunks: 0 },
    'QWEN_CODER+COLD': { project_summary: 0, cognee_chunks: 0 },
};
export function resolveWarmthTier(score) {
    if (score >= 0.6)
        return 'HOT';
    if (score >= 0.3)
        return 'WARM';
    return 'COLD';
}
export function assembleAnchor(input) {
    const { modelTier, warmth, canonScore, projectId, canonicalSummary, cogneeChunks } = input;
    const tier = { model_tier: modelTier, warmth_tier: warmth };
    const rawBudget = TIER_TOKEN_BUDGET[modelTier];
    const tokenBudget = Math.floor(rawBudget * WARMTH_MULTIPLIER[warmth]);
    const parts = [];
    if (canonicalSummary) {
        const summaryBudget = Math.floor(tokenBudget * 0.8);
        const trimmedSummary = truncateToTokens(canonicalSummary, summaryBudget);
        parts.push(`## Project Memory:\n${trimmedSummary}`);
    }
    if (cogneeChunks.length > 0) {
        const chunkBudget = Math.floor(tokenBudget * 0.2);
        const chunkText = truncateToTokens(cogneeChunks.join('\n\n'), chunkBudget);
        parts.push(`## Relevant Context:\n${chunkText}`);
    }
    let content = parts.join('\n\n');
    // Hardening: scan assembled anchor for injection patterns
    if (content.length > 0) {
        const scanResult = scanForInjection(content);
        if (scanResult.detected) {
            content = scanResult.sanitized;
            logger.warn({ projectId, matchCount: scanResult.matches.length }, 'hardening: anchor content sanitized — injection patterns removed');
        }
    }
    const token_count = estimateTokens(content);
    return { content, token_count, tier, project_id: projectId, canon_score: canonScore };
}
// Returns the estimated token cost of a fully-loaded HOT-tier anchor.
// Used by memory-session to compute "saved vs full" for the token log.
export function computeFullHotBaselineCost(mode, canonicalSummary) {
    const modelTier = resolveModelTier(mode);
    const fullBudget = TIER_TOKEN_BUDGET[modelTier]; // HOT = 1.0 multiplier
    const summaryTokens = estimateTokens(canonicalSummary);
    const overhead = 10; // "## Project Memory:\n" header
    return Math.min(fullBudget, summaryTokens + overhead);
}
//# sourceMappingURL=memory-anchor-builder.js.map