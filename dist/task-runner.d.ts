/**
 * Task Runner
 *
 * Executes a project plan in one of two modes, with automatic mode switching:
 *
 * ── STRUCTURED MODE (default, token-efficient) ────────────────────────────────
 * Walks PlanResult.subtasks in dependency order. Each step dispatched to the
 * right handler with a focused anchor-injected prompt. Token-efficient because
 * each call only needs: static system prompt + anchor (50-800 tokens) + one step.
 * The model can't wander — it knows exactly what to do.
 *
 * Tool dispatch:
 *   search  → web-search.ts (local, no container)
 *   fetch   → web-fetch.ts  (local, no container)
 *   bash / file / browser / api → containerExecute() with focused step prompt
 *
 * ── AUTONOMOUS MODE (adaptive, nanobot-style) ─────────────────────────────────
 * Hands all remaining steps to the container with full plan context. The model
 * iterates, discovers, and adapts. Used when:
 *   • A step fails twice (automatic escape hatch — no user action needed)
 *   • task_type is 'research' or 'complex' and verification flagged issues
 *   • User sends !auto override
 *
 * ── AUTOMATIC ESCAPE HATCH ────────────────────────────────────────────────────
 * Structured step failure: retry once → retry twice → flip to autonomous.
 * The flip is silent — user just sees progress continue. task_state.json records
 * the mode switch so the self-improvement loop can learn which task types
 * reliably succeed in structured mode vs needing autonomous.
 *
 * ── CACHE SAFETY ──────────────────────────────────────────────────────────────
 * Following the Claude Code caching article:
 *   • System prompt is STATIC — never changes between steps
 *   • Step context injected as user messages (not system prompt mutations)
 *   • Anchor injected as <system-reminder> tag in user turn
 *   • Mode switch doesn't change tools — autonomous uses same toolset
 *
 * ── DECOUPLED CONTAINER INTERFACE ────────────────────────────────────────────
 * task-runner doesn't import container-runner directly (avoids circular deps).
 * Instead accepts a `containerExecute` callback — the caller (container-runner)
 * passes its own execution function in. Clean inversion of control.
 */
import { PlanResult } from './project-planner.js';
import { Channel } from './types.js';
import { ExecutionRoutingContext } from './execution-routing.js';
import { StepRoutingDecision } from './step-router.js';
import { BudgetBlockedReason } from './budget-policy.js';
import type { MemorySessionContext } from './memory-session.js';
export type ExecutionMode = 'structured' | 'autonomous';
export interface TaskRunnerOptions {
    /** Starting mode. Default: 'structured' */
    mode?: ExecutionMode;
    /** Max retries per step before flipping to autonomous. Default: 2 */
    maxStepRetries?: number;
    /** Max iterations in autonomous mode. Default: 20 */
    maxAutonomousIter?: number;
    /** Model context window for anchor sizing. Default: 32000 */
    modelContextTokens?: number;
    /** Message ID of the original user message (for Discord thread creation) */
    originalMsgId?: string;
    /** Answers collected from the clarification state machine (keyed by question id) */
    clarificationAnswers?: Record<string, string>;
    /** Max container invocations before hard stop. Default: MAX_TASK_CALLS from config */
    maxCalls?: number;
    /** Vault credentials passed from planner/runner (internal). */
    vaultEnv?: Record<string, string>;
    /** Routing context shared across ingress → planner → runner. */
    routingContext?: ExecutionRoutingContext;
    /** Anchor/user-context loaded synchronously before execution. */
    injectedAnchorContext?: {
        anchorContent: string;
        userContext: string;
    };
    /** Stable external session identifier to propagate into container execution. */
    sessionId?: string;
    /** Platform-owned workspace lease metadata (read-only context for runtime integration). */
    workspaceLeaseId?: string;
    workspaceNamespace?: string;
    memoryContext?: MemorySessionContext;
    /** Correlation ID for distributed tracing */
    traceId?: string;
}
export interface TaskRunResult {
    success: boolean;
    mode: ExecutionMode;
    /** Mode at completion — may differ from starting mode if escape hatch triggered */
    finalMode: ExecutionMode;
    stepsCompleted: number;
    stepsFailed: number;
    escapeHatchTriggered: boolean;
    outputs: string[];
    budget_blocked_reason?: BudgetBlockedReason | 'awaiting_pro_shard_approval';
    spend_summary?: {
        task_spent_usd: number;
        call_count: number;
        mode: ExecutionRoutingContext['effective_mode'];
    };
    escalation_spend?: number;
    mcp_executed_steps?: string[];
}
/**
 * Container execution callback — passed in by container-runner to avoid
 * circular imports. Receives a focused prompt and returns the output text.
 */
export type ContainerExecuteFn = (prompt: string, chatJid: string, vaultEnv?: Record<string, string>, stepRoutingDecision?: StepRoutingDecision, sessionId?: string) => Promise<string>;
/**
 * Execute a project plan.
 *
 * Starts in STRUCTURED mode by default. If a step fails maxStepRetries times,
 * the escape hatch fires automatically and the runner switches to AUTONOMOUS.
 * No user action required — the switch is silent and logged.
 *
 * @param plan             PlanResult from enterProjectPlanMode()
 * @param channel          Active chat channel (Telegram or Discord)
 * @param chatJid          Chat identifier
 * @param containerExecute Callback that runs a prompt in the container
 * @param vaultEnv         Decoded vault credentials (keys/values)
 * @param opts             Runner options (mode override, retry limits, etc.)
 */
export declare function runTask(plan: PlanResult, channel: Channel, chatJid: string, containerExecute: ContainerExecuteFn, vaultEnv?: Record<string, string>, opts?: TaskRunnerOptions): Promise<TaskRunResult>;
//# sourceMappingURL=task-runner.d.ts.map