/**
 * Project Planner
 *
 * Applies the caching lessons from the Claude Code team directly:
 *
 *   1. NEVER swap the toolset to enter plan mode — tools stay identical always.
 *      Instead we inject a <plan_mode> system message into the conversation.
 *      This keeps the cached prefix intact across every planning session.
 *
 *   2. The planning system prompt is STATIC — the same string every call.
 *      It gets cached once and reused on every project. Dynamic context
 *      (task description, vault keys, workspace path) goes in as a MESSAGE,
 *      not in the system prompt.
 *
 *   3. qwen3:8b runs the planning step locally — free, ~300-800ms, zero cloud
 *      tokens. Only the execution phase (if needed) escalates to cloud.
 *
 *   4. AskUserQuestion-style clarification before writing the plan — structured
 *      JSON questions so we always get parseable answers, not free-form text.
 *
 *   5. Plan is written to task.md on disk and injected back as a
 *      <system-reminder> in the execution phase — never touches the system prompt.
 *
 *   6. Subagent handoff format: the plan document doubles as the handoff brief
 *      so the execution agent can start a fresh session with full context and
 *      still get cache hits on its own static prefix.
 *
 * Flow:
 *   receive task → classify → [ask clarifying questions if ambiguous] →
 *   qwen3:8b breaks into subtasks → write task.md → return PlanResult
 */
import { ProjectWorkspace } from './project-workspace.js';
import { type WorkspaceContextHandle } from './platform-context-manager.js';
export declare const PLANNER_DEFAULTS: Record<string, {
    provider: string;
    model: string;
}>;
export interface ClarifyingQuestion {
    id: string;
    question: string;
    options: string[];
    required: boolean;
}
export interface PlanSubtask {
    step: number;
    description: string;
    tool: string;
    dependsOn: number[];
    estimatedMs: number;
    risk_level?: 'low' | 'medium' | 'high';
    criticality_tags?: string[];
}
export interface PlanResult {
    workspace: ProjectWorkspace;
    workspaceHandle?: WorkspaceContextHandle;
    subtasks: PlanSubtask[];
    clarifications: ClarifyingQuestion[];
    planMarkdown: string;
    needsContainer: boolean;
    credentialKeys: string[];
    autoAnswers?: Record<string, string>;
    needs_decomposition: boolean;
}
export declare function flagNeedsDecomposition(subtasks: PlanSubtask[]): boolean;
/**
 * Enter project plan mode for a task.
 *
 * This is cache-safe: it uses a static system prompt, injects dynamic context
 * as a user message, and writes the plan to task.md (not the system prompt).
 * The returned PlanResult includes clarifying questions to surface to the user
 * before execution begins, following the AskUserQuestion pattern.
 *
 * @param taskDescription  The raw task prompt from the user
 * @param vaultKeys        Keys already present in vault.env (if any)
 * @param plannerProvider  Override provider (defaults to PLANNER_DEFAULTS['standard'].provider)
 * @param plannerModel     Override model (defaults to PLANNER_DEFAULTS['standard'].model)
 */
export declare function enterProjectPlanMode(taskDescription: string, vaultKeys?: string[], plannerProvider?: string, plannerModel?: string): Promise<PlanResult>;
/**
 * Build the handoff message for the execution subagent.
 *
 * This message is injected as a <system-reminder> at the start of the
 * execution session — keeping the execution agent's system prompt static
 * (cache-safe) while giving it full plan context.
 */
export declare function buildHandoffMessage(plan: PlanResult, clarificationAnswers?: Record<string, string>): string;
//# sourceMappingURL=project-planner.d.ts.map