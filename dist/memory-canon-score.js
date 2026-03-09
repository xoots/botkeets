import { MVP_WEIGHTS } from './memory-types.js';
import { CanonScoreInputSchema, safeParseWithFallback } from './hardening-schemas.js';
const HALF_LIFE_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds
const FREQUENCY_NORMALIZE_COUNT = 20;
export function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
export function computeProjectCentroid(taskEmbeddings) {
    if (taskEmbeddings.length === 0)
        return [];
    const dim = taskEmbeddings[0].length;
    const centroid = new Array(dim).fill(0);
    for (const emb of taskEmbeddings) {
        for (let i = 0; i < dim; i++)
            centroid[i] += emb[i];
    }
    return centroid.map(v => v / taskEmbeddings.length);
}
export function computeAlpha(taskEmbedding, projectCentroid) {
    if (taskEmbedding.length === 0 || projectCentroid.length === 0)
        return 0;
    return Math.max(0, Math.min(1, cosineSimilarity(taskEmbedding, projectCentroid)));
}
export function computeBeta(lastTouchedUnix, nowUnix) {
    const now = nowUnix ?? Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, now - lastTouchedUnix);
    return Math.exp((-Math.LN2 * elapsed) / HALF_LIFE_SECONDS);
}
export function computeGamma(signals, nowUnix) {
    const now = nowUnix ?? Math.floor(Date.now() / 1000);
    const windowStart = now - HALF_LIFE_SECONDS;
    const count = signals.filter(s => s.ts_unix >= windowStart).length;
    return Math.min(count / FREQUENCY_NORMALIZE_COUNT, 1.0);
}
export function computeCanonScore(input) {
    // Hardening: validate input structure — safe defaults on failure
    const validated = safeParseWithFallback(input, CanonScoreInputSchema, { taskEmbedding: [], projectCentroid: [], lastTouchedUnix: 0, signals: [] }, 'computeCanonScore');
    const safe = {
        ...input,
        taskEmbedding: validated.taskEmbedding,
        projectCentroid: validated.projectCentroid,
        lastTouchedUnix: Math.max(0, validated.lastTouchedUnix),
        signals: validated.signals,
    };
    const weights = safe.weights ?? MVP_WEIGHTS;
    const alpha = computeAlpha(safe.taskEmbedding, safe.projectCentroid);
    const beta = computeBeta(safe.lastTouchedUnix, safe.nowUnix);
    const gamma = computeGamma(safe.signals, safe.nowUnix);
    const score = alpha * weights.alpha + beta * weights.beta + gamma * weights.gamma;
    return { score: Math.max(0, Math.min(1, score)), alpha, beta, gamma, weights };
}
//# sourceMappingURL=memory-canon-score.js.map