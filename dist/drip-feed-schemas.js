/**
 * Zod validation schemas for drip-feed and planning types.
 * Design: parse-with-fallback. safeParseWithFallback() returns fallback on
 * validation failure — never throws, never hard-fails.
 */
import { z } from 'zod';
import { logger } from './logger.js';
// ── Generic safe parser ─────────────────────────────────────────────────
export function safeParseWithFallback(data, schema, fallback, context) {
    const result = schema.safeParse(data);
    if (result.success)
        return result.data;
    logger.warn({ errors: result.error.issues.slice(0, 3), context }, 'schema validation failed — using fallback');
    return fallback;
}
// ── Schemas ─────────────────────────────────────────────────────────────
export const MicroTaskSchema = z.object({
    id: z.string().min(1),
    parent_task_id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(['pending', 'running', 'done', 'failed']),
    priority: z.number().int().min(0),
    created_at_unix: z.number().int().min(0),
    execution_hint: z.enum(['deterministic_fetch', 'deterministic_read_file', 'deterministic_git', 'deterministic_shell', 'model_required']).optional(),
});
export const MicroTaskArraySchema = z.array(MicroTaskSchema);
export const StagingEntrySchema = z.object({
    id: z.string().min(1),
    project_id: z.string().min(1),
    content: z.string(),
    entry_type: z.enum(['micro_task', 'memory_fragment', 'signal_batch']),
    staged_at_unix: z.number().int().min(0),
    promoted: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export const DripFeedConfigSchema = z.object({
    batch_size: z.number().int().min(1).max(50),
    interval_seconds: z.number().int().min(1).max(3600),
    max_pending: z.number().int().min(1).max(200),
    auto_promote: z.boolean(),
});
export const PlanSubtaskSchema = z.object({
    step: z.number().int().min(1),
    description: z.string().min(1),
    tool: z.string().min(1),
    dependsOn: z.array(z.number().int()),
    estimatedMs: z.number().int().min(0),
    risk_level: z.enum(['low', 'medium', 'high']).optional(),
    criticality_tags: z.array(z.string()).optional(),
});
export const PlanSubtaskArraySchema = z.array(PlanSubtaskSchema);
export const RawDecompositionSchema = z.object({
    micro_tasks: z.array(z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.number().optional(),
    })),
});
//# sourceMappingURL=drip-feed-schemas.js.map