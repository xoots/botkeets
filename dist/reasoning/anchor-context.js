export function selectPerShardContextTokens(baseContextTokens, shardDepth) {
    if (shardDepth <= 0)
        return baseContextTokens;
    return Math.min(baseContextTokens, 8_000);
}
//# sourceMappingURL=anchor-context.js.map