const HIGH_RISK_RE = /\b(auth|security|deploy|release|migration|database|schema|payment|secret|token|prod|production|infra|infrastructure)\b/i;
const MEDIUM_RISK_RE = /\b(api|integration|external|network|sync|state|persistence)\b/i;
export function inferRiskLevel(step) {
    if (step.risk_level)
        return step.risk_level;
    if (HIGH_RISK_RE.test(step.description))
        return 'high';
    if (MEDIUM_RISK_RE.test(step.description))
        return 'medium';
    return 'low';
}
export function inferCriticalityTags(step) {
    if (Array.isArray(step.criticality_tags) && step.criticality_tags.length > 0) {
        return step.criticality_tags;
    }
    const tags = [];
    const desc = step.description.toLowerCase();
    if (/auth|token|secret|credential/.test(desc))
        tags.push('auth');
    if (/deploy|release|prod|infrastructure/.test(desc))
        tags.push('release');
    if (/migration|schema|database/.test(desc))
        tags.push('migration');
    if (/external|api|network/.test(desc))
        tags.push('external');
    return tags;
}
export function decideRiskBasedEscalation(args) {
    const { step, context, attempt, models, strictLocalOverride } = args;
    const risk = inferRiskLevel(step);
    const tags = inferCriticalityTags(step);
    const mode = context.effective_mode;
    let provider;
    let model;
    let maxRetries = 2;
    let escalationTarget = null;
    if (mode === 'pro') {
        provider = 'claude';
        model = models.pro_default;
        maxRetries = 2;
    }
    else if (mode === 'eco') {
        provider = 'ollama';
        model = models.eco_local;
        maxRetries = 1;
        if (!strictLocalOverride) {
            escalationTarget = { provider: 'openrouter', model: models.standard_default };
        }
    }
    else {
        if (step.tool === 'search' || step.tool === 'fetch') {
            provider = 'ollama';
            model = models.eco_search;
            maxRetries = 1;
            escalationTarget = { provider: 'openrouter', model: models.standard_default };
        }
        else if (risk === 'high') {
            provider = 'claude';
            model = models.pro_default;
            maxRetries = 1;
        }
        else {
            provider = 'openrouter';
            model = models.standard_default;
            maxRetries = 2;
            escalationTarget = { provider: 'claude', model: models.standard_escalation };
        }
    }
    const shouldEscalate = Boolean(escalationTarget && attempt >= maxRetries && mode !== 'pro');
    if (shouldEscalate && escalationTarget) {
        provider = escalationTarget.provider;
        model = escalationTarget.model;
    }
    return {
        step: step.step,
        tool: step.tool,
        risk_level: risk,
        criticality_tags: tags,
        provider,
        model,
        max_retries: maxRetries,
        escalation_target: escalationTarget,
        attempt,
        is_escalated: shouldEscalate,
        override_source: context.source,
        effective_mode: mode,
        lane_used: context.lane ?? 'keet_execution',
    };
}
//# sourceMappingURL=risk-escalation.js.map