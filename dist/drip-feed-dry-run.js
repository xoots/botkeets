import { inferExecutionHint } from './deterministic-executor.js';
import { decideStepRouting } from './step-router.js';
import { scanForAdjustments } from './pre-task-reflection.js';
/** Token cost estimates per tool type — zero for deterministic steps */
const TOKEN_ESTIMATES = {
    fetch: 300,
    search: 500,
    bash: 1200,
    file: 800,
    browser: 2000,
    api: 1000,
};
/**
 * Simulate the drip-feed loop without spawning containers, calling models,
 * or modifying any state. Returns a report with step counts, token estimates,
 * routing decisions, and deterministic eligibility.
 */
export function dryRunDripFeed(plan, routingContext) {
    const taskId = plan.workspace?.id ?? `dry-run-${Date.now()}`;
    const subtasks = plan.subtasks ?? [];
    // Pre-task reflection — disk-only signal reads, no network
    const combinedContent = subtasks.map((s) => s.description).join(' ');
    const adjustment = scanForAdjustments(combinedContent);
    const steps = [];
    let deterministicSteps = 0;
    let modelSteps = 0;
    let estimatedTotalTokens = 0;
    let baselineTotalTokens = 0;
    for (const subtask of subtasks) {
        const hint = inferExecutionHint(subtask.description);
        const isDeterministic = hint !== 'model_required';
        const tool = subtask.tool ?? 'bash';
        const baseTokens = TOKEN_ESTIMATES[tool] ?? TOKEN_ESTIMATES.bash;
        const estimatedTokens = isDeterministic ? 0 : baseTokens;
        // Route all steps if context available (informational only)
        let routingDecision;
        if (routingContext) {
            try {
                routingDecision = decideStepRouting(subtask, routingContext, 1);
            }
            catch {
                // Ignore routing failures in dry run
            }
        }
        if (isDeterministic) {
            deterministicSteps++;
        }
        else {
            modelSteps++;
        }
        estimatedTotalTokens += estimatedTokens;
        baselineTotalTokens += baseTokens;
        steps.push({
            step: subtask.step,
            title: subtask.description.slice(0, 80),
            description: subtask.description,
            tool,
            execution_hint: hint,
            is_deterministic: isDeterministic,
            estimated_tokens: estimatedTokens,
            routing_decision: routingDecision,
        });
    }
    const tokenSavings = baselineTotalTokens - estimatedTotalTokens;
    const savingsPercentage = baselineTotalTokens > 0
        ? Math.round((tokenSavings / baselineTotalTokens) * 100)
        : 0;
    return {
        task_id: taskId,
        total_steps: steps.length,
        deterministic_steps: deterministicSteps,
        model_steps: modelSteps,
        estimated_total_tokens: estimatedTotalTokens,
        estimated_token_savings: tokenSavings,
        savings_percentage: savingsPercentage,
        pre_task_hints: adjustment.hints,
        steps,
    };
}
//# sourceMappingURL=drip-feed-dry-run.js.map