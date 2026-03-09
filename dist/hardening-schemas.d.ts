/**
 * Hardening Phase 1: Zod validation schemas and sanitization utilities.
 *
 * Design: safeParseWithFallback from drip-feed-schemas.ts — warn on fail,
 * return safe default, never throw, never hard-fail.
 */
import { z } from 'zod';
import { safeParseWithFallback } from './drip-feed-schemas.js';
/** Maximum raw message length before truncation (chars). */
export declare const MAX_INPUT_LENGTH = 10000;
/**
 * Sanitize a string for safe use: strip control chars (except newline/tab),
 * remove null bytes, cap length.
 */
export declare function sanitizeInput(raw: string, maxLength?: number): string;
/**
 * Sanitize projectId for filesystem safety.
 * Strips path separators, dots, null bytes, control chars.
 * Returns null if the result is empty.
 */
export declare function sanitizeProjectId(raw: string | null | undefined): string | null;
/**
 * Check if a string contains double-encoding patterns (e.g., %252e = encoded %2e).
 */
export declare function hasDoubleEncoding(s: string): boolean;
export declare const ClassifyTaskInputSchema: z.ZodString;
export declare const SignalEmitSchema: z.ZodObject<{
    projectId: z.ZodString;
    signalType: z.ZodEnum<{
        direct_query: "direct_query";
        semantic_proximity: "semantic_proximity";
        task_completion: "task_completion";
        step_execution: "step_execution";
        step_failure: "step_failure";
    }>;
    weight: z.ZodNumber;
    taskId: z.ZodOptional<z.ZodString>;
    embeddingDistance: z.ZodOptional<z.ZodNumber>;
    parentId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const CanonScoreInputSchema: z.ZodObject<{
    taskEmbedding: z.ZodArray<z.ZodNumber>;
    projectCentroid: z.ZodArray<z.ZodNumber>;
    lastTouchedUnix: z.ZodNumber;
    signals: z.ZodArray<z.ZodObject<{
        ts_unix: z.ZodNumber;
    }, z.core.$strip>>;
    nowUnix: z.ZodOptional<z.ZodNumber>;
    weights: z.ZodOptional<z.ZodObject<{
        alpha: z.ZodNumber;
        beta: z.ZodNumber;
        gamma: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const AnchorAssemblyInputSchema: z.ZodObject<{
    modelTier: z.ZodEnum<{
        CLAUDE: "CLAUDE";
        QWEN_MAX: "QWEN_MAX";
        QWEN_PLUS: "QWEN_PLUS";
        QWEN_CODER: "QWEN_CODER";
        DEEPSEEK: "DEEPSEEK";
    }>;
    warmth: z.ZodEnum<{
        HOT: "HOT";
        WARM: "WARM";
        COLD: "COLD";
    }>;
    canonScore: z.ZodNumber;
    projectId: z.ZodNullable<z.ZodString>;
    canonicalSummary: z.ZodString;
    cogneeChunks: z.ZodArray<z.ZodString>;
    sessionId: z.ZodString;
}, z.core.$strip>;
export interface InjectionScanResult {
    detected: boolean;
    matches: Array<{
        pattern: string;
        position: number;
    }>;
    sanitized: string;
}
/**
 * Scan content for prompt injection patterns. Strip matches, log findings.
 * Never throws.
 */
export declare function scanForInjection(content: string): InjectionScanResult;
export { safeParseWithFallback };
//# sourceMappingURL=hardening-schemas.d.ts.map