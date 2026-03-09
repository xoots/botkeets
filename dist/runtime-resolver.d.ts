import type { ExecutionRoutingContext } from './execution-routing.js';
import type { ProviderPlan } from './mode-router.js';
export type Runner = 'ollama' | 'claude' | 'openrouter' | 'dashscope' | 'deepseek';
export interface RuntimeDecision {
    /** Final runner/provider selection */
    runner: Runner;
    /** Model identifier for the selected runner */
    model: string;
    /** Script name for container execution */
    containerScript: string;
    /** API key env var name needed by this runner */
    providerKeyEnv: string;
    /** Audit trail: why this runner was chosen */
    reason: string;
    /** The routing context that produced this decision */
    routingContext: ExecutionRoutingContext;
    /** The provider plan that informed this decision (if available) */
    providerPlan?: ProviderPlan;
}
interface RunnerScriptInfo {
    script: string;
    providerKeyEnv: string;
    modelEnvVar?: string;
}
/**
 * Pure mapping of Runner → container script name and API key env var.
 * Exported so runContainerPrompt() can use it directly for step-level routing.
 */
export declare function runnerToScriptInfo(runner: Runner): RunnerScriptInfo;
/**
 * Single authority function for runtime selection.
 * Every call site in the codebase must use this function instead of
 * making independent runner/provider decisions.
 *
 * Input priority:
 *   1. ProviderPlan (from mode-router, if available — most specific)
 *   2. ExecutionRoutingContext.effective_mode (fallback when no plan)
 *   3. Provider capability check (guards against misconfigured providers)
 */
export declare function resolveRuntime(routingContext: ExecutionRoutingContext, providerPlan?: ProviderPlan): RuntimeDecision;
export {};
//# sourceMappingURL=runtime-resolver.d.ts.map