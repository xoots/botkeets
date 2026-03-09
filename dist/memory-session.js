import { getProjectMemory, insertMemoryTokenLog, getMemorySignalsForProject } from './db.js';
import { resolveProjectIdFromContent } from './memory-project-resolver.js';
import { computeCanonScore, computeProjectCentroid } from './memory-canon-score.js';
import { assembleAnchor, computeFullHotBaselineCost, resolveModelTier, resolveWarmthTier, computeContextCap } from './memory-anchor-builder.js';
import { logger } from './logger.js';
import { sanitizeInput } from './hardening-schemas.js';
import { searchCognee } from './memory-cognee-search.js';
// Session-level anchor cache: DeepSeek gets identical prefix bytes across calls
const sessionAnchorCache = new Map(); // sessionId → anchor content
export function getSessionAnchor(sessionId) {
    return sessionAnchorCache.get(sessionId) ?? null;
}
export async function loadMemoryForTask(taskContent, mode, sessionId) {
    try {
        // Hardening: sanitize task content before project resolution + Cognee search
        taskContent = sanitizeInput(taskContent);
        if (!taskContent) {
            logger.debug('memory-session: empty task content after sanitization — skipping memory');
            return null;
        }
        const projectId = resolveProjectIdFromContent(taskContent);
        const now7DaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
        const signals = projectId ? getMemorySignalsForProject(projectId, now7DaysAgo) : [];
        let canonicalSummary = '';
        let taskEmbeddings = [];
        let lastTouchedUnix = 0;
        if (projectId) {
            const row = getProjectMemory(projectId);
            if (row) {
                canonicalSummary = row.canonical_summary;
                lastTouchedUnix = row.last_touched_unix;
                try {
                    taskEmbeddings = JSON.parse(row.task_embeddings);
                }
                catch {
                    taskEmbeddings = [];
                }
            }
        }
        const centroid = computeProjectCentroid(taskEmbeddings);
        const scoreResult = computeCanonScore({
            taskEmbedding: [],
            projectCentroid: centroid,
            lastTouchedUnix,
            signals,
        });
        // Resolve tiers before calling assembleAnchor
        const modelTier = resolveModelTier(mode);
        const warmth = resolveWarmthTier(scoreResult.score);
        const cogneeResults = projectId ? await searchCognee(taskContent, projectId, 3) : [];
        const cogneeChunks = cogneeResults.map(c => c.content);
        let anchor = assembleAnchor({
            modelTier,
            warmth,
            canonScore: scoreResult.score,
            projectId,
            canonicalSummary,
            cogneeChunks,
            sessionId,
        });
        // Dynamic context cap: enforce max memory share of model context window
        const contextCap = computeContextCap(modelTier);
        if (anchor.token_count > contextCap) {
            const ratio = contextCap / anchor.token_count;
            const trimmedContent = anchor.content.slice(0, Math.floor(anchor.content.length * ratio)).trimEnd();
            anchor = { ...anchor, content: trimmedContent, token_count: Math.ceil(trimmedContent.length / 4) };
            logger.debug({ modelTier, contextCap, original: anchor.token_count, trimmed: anchor.token_count }, 'memory-session: anchor trimmed to context cap');
        }
        // Cache the anchor content for session prefix consistency (DeepSeek caching)
        sessionAnchorCache.set(sessionId, anchor.content);
        const tierKey = `${anchor.tier.model_tier}+${anchor.tier.warmth_tier}`;
        const baseline = projectId ? computeFullHotBaselineCost(mode, canonicalSummary) : anchor.token_count;
        const savedVsFull = Math.max(0, baseline - anchor.token_count);
        insertMemoryTokenLog(sessionId, projectId, tierKey, anchor.token_count, savedVsFull);
        logger.debug({ projectId, tierKey, score: scoreResult.score.toFixed(3), tokens: anchor.token_count, saved: savedVsFull }, 'memory-session: anchor assembled');
        return { anchor, projectId, canonScore: scoreResult.score, tierKey };
    }
    catch (err) {
        logger.warn({ err }, 'memory-session: loadMemoryForTask failed — proceeding without memory');
        return null;
    }
}
//# sourceMappingURL=memory-session.js.map