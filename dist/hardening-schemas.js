/**
 * Hardening Phase 1: Zod validation schemas and sanitization utilities.
 *
 * Design: safeParseWithFallback from drip-feed-schemas.ts — warn on fail,
 * return safe default, never throw, never hard-fail.
 */
import { z } from 'zod';
import { logger } from './logger.js';
import { safeParseWithFallback } from './drip-feed-schemas.js';
// ── Constants ───────────────────────────────────────────────────────────
/** Maximum raw message length before truncation (chars). */
export const MAX_INPUT_LENGTH = 10_000;
/** Maximum projectId length. */
const MAX_PROJECT_ID_LENGTH = 128;
/** Characters forbidden in projectId (path traversal, null bytes, control chars). */
const UNSAFE_PROJECT_ID_RE = /[\/\\.\x00-\x1f\x7f]/g;
// ── Input Sanitization Utilities ────────────────────────────────────────
/**
 * Sanitize a string for safe use: strip control chars (except newline/tab),
 * remove null bytes, cap length.
 */
export function sanitizeInput(raw, maxLength = MAX_INPUT_LENGTH) {
    if (typeof raw !== 'string')
        return '';
    const cleaned = raw.replace(/\x00/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    return cleaned.slice(0, maxLength);
}
/**
 * Sanitize projectId for filesystem safety.
 * Strips path separators, dots, null bytes, control chars.
 * Returns null if the result is empty.
 */
export function sanitizeProjectId(raw) {
    if (!raw || typeof raw !== 'string')
        return null;
    const cleaned = raw.replace(UNSAFE_PROJECT_ID_RE, '').slice(0, MAX_PROJECT_ID_LENGTH);
    return cleaned.length > 0 ? cleaned : null;
}
/**
 * Check if a string contains double-encoding patterns (e.g., %252e = encoded %2e).
 */
export function hasDoubleEncoding(s) {
    return /%25[0-9a-fA-F]{2}/.test(s);
}
// ── Zod Schemas ─────────────────────────────────────────────────────────
export const ClassifyTaskInputSchema = z.string().min(1).max(MAX_INPUT_LENGTH);
export const SignalEmitSchema = z.object({
    projectId: z.string().min(1).max(MAX_PROJECT_ID_LENGTH),
    signalType: z.enum(['direct_query', 'semantic_proximity', 'task_completion', 'step_execution', 'step_failure']),
    weight: z.number().min(0).max(2),
    taskId: z.string().optional(),
    embeddingDistance: z.number().optional(),
    parentId: z.string().optional(),
});
export const CanonScoreInputSchema = z.object({
    taskEmbedding: z.array(z.number()),
    projectCentroid: z.array(z.number()),
    lastTouchedUnix: z.number().int().min(0),
    signals: z.array(z.object({ ts_unix: z.number().int().min(0) })),
    nowUnix: z.number().int().min(0).optional(),
    weights: z.object({
        alpha: z.number().min(0).max(1),
        beta: z.number().min(0).max(1),
        gamma: z.number().min(0).max(1),
    }).optional(),
});
export const AnchorAssemblyInputSchema = z.object({
    modelTier: z.enum(['CLAUDE', 'QWEN_MAX', 'QWEN_PLUS', 'QWEN_CODER', 'DEEPSEEK']),
    warmth: z.enum(['HOT', 'WARM', 'COLD']),
    canonScore: z.number().min(0).max(1),
    projectId: z.string().nullable(),
    canonicalSummary: z.string(),
    cogneeChunks: z.array(z.string()),
    sessionId: z.string().min(1),
});
// ── Anchor Injection Scanner ────────────────────────────────────────────
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+(instructions|prompts|context)/i,
    /disregard\s+(all\s+)?(above|previous|prior)/i,
    /you\s+are\s+now\s+(a|an|the)\b/i,
    /\bsystem\s*:\s*(override|ignore|forget|reset)/i,
    /\badmin\s+(override|mode|access)\b/i,
    /\bdo\s+not\s+follow\s+(the\s+)?(above|previous)\b/i,
    /\bnew\s+instructions?\s*:/i,
    /\bforget\s+(everything|all|your)\b/i,
    /\bACT\s+AS\b/i,
    /\bJAILBREAK\b/i,
    /\bDAN\s+mode\b/i,
];
/**
 * Scan content for prompt injection patterns. Strip matches, log findings.
 * Never throws.
 */
export function scanForInjection(content) {
    const matches = [];
    let sanitized = content;
    for (const pattern of INJECTION_PATTERNS) {
        let match;
        const globalPattern = new RegExp(pattern.source, 'gi');
        while ((match = globalPattern.exec(content)) !== null) {
            matches.push({ pattern: pattern.source, position: match.index });
        }
        sanitized = sanitized.replace(new RegExp(pattern.source, 'gi'), '[REDACTED]');
    }
    if (matches.length > 0) {
        logger.warn({ matchCount: matches.length, patterns: matches.map(m => m.pattern).slice(0, 3) }, 'hardening: injection patterns detected in anchor content — stripped');
    }
    return { detected: matches.length > 0, matches, sanitized };
}
export { safeParseWithFallback };
//# sourceMappingURL=hardening-schemas.js.map