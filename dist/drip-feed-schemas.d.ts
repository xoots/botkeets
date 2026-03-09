/**
 * Zod validation schemas for drip-feed and planning types.
 * Design: parse-with-fallback. safeParseWithFallback() returns fallback on
 * validation failure — never throws, never hard-fails.
 */
import { z } from 'zod';
export declare function safeParseWithFallback<T>(data: unknown, schema: z.ZodType<T>, fallback: T, context?: string): T;
export declare const MicroTaskSchema: z.ZodObject<{
    id: z.ZodString;
    parent_task_id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        running: "running";
        done: "done";
        failed: "failed";
    }>;
    priority: z.ZodNumber;
    created_at_unix: z.ZodNumber;
    execution_hint: z.ZodOptional<z.ZodEnum<{
        deterministic_fetch: "deterministic_fetch";
        deterministic_read_file: "deterministic_read_file";
        deterministic_git: "deterministic_git";
        deterministic_shell: "deterministic_shell";
        model_required: "model_required";
    }>>;
}, z.core.$strip>;
export declare const MicroTaskArraySchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    parent_task_id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        running: "running";
        done: "done";
        failed: "failed";
    }>;
    priority: z.ZodNumber;
    created_at_unix: z.ZodNumber;
    execution_hint: z.ZodOptional<z.ZodEnum<{
        deterministic_fetch: "deterministic_fetch";
        deterministic_read_file: "deterministic_read_file";
        deterministic_git: "deterministic_git";
        deterministic_shell: "deterministic_shell";
        model_required: "model_required";
    }>>;
}, z.core.$strip>>;
export declare const StagingEntrySchema: z.ZodObject<{
    id: z.ZodString;
    project_id: z.ZodString;
    content: z.ZodString;
    entry_type: z.ZodEnum<{
        micro_task: "micro_task";
        memory_fragment: "memory_fragment";
        signal_batch: "signal_batch";
    }>;
    staged_at_unix: z.ZodNumber;
    promoted: z.ZodBoolean;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const DripFeedConfigSchema: z.ZodObject<{
    batch_size: z.ZodNumber;
    interval_seconds: z.ZodNumber;
    max_pending: z.ZodNumber;
    auto_promote: z.ZodBoolean;
}, z.core.$strip>;
export declare const PlanSubtaskSchema: z.ZodObject<{
    step: z.ZodNumber;
    description: z.ZodString;
    tool: z.ZodString;
    dependsOn: z.ZodArray<z.ZodNumber>;
    estimatedMs: z.ZodNumber;
    risk_level: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>;
    criticality_tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const PlanSubtaskArraySchema: z.ZodArray<z.ZodObject<{
    step: z.ZodNumber;
    description: z.ZodString;
    tool: z.ZodString;
    dependsOn: z.ZodArray<z.ZodNumber>;
    estimatedMs: z.ZodNumber;
    risk_level: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>;
    criticality_tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const RawDecompositionSchema: z.ZodObject<{
    micro_tasks: z.ZodArray<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        priority: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=drip-feed-schemas.d.ts.map