// 4 chars ≈ 1 token — inlined to avoid pulling in context-manager's heavy deps
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
const MAX_SUMMARY_TOKENS = 300;
const MAX_FINDING_TOKENS = 40;
const MAX_FINDINGS_COUNT = 3;
export const MODEL_TIER_BY_AGENT_TYPE = {
    'coder': 'QWEN_CODER',
    'deployer': 'QWEN_CODER',
    'researcher': 'DEEPSEEK',
    'analyst': 'QWEN_MAX',
    'orchestrator': 'CLAUDE',
    'qa': 'CLAUDE',
    'writer': 'QWEN_PLUS',
};
export function resolveModelTierFromAgentType(agentType) {
    return MODEL_TIER_BY_AGENT_TYPE[agentType.toLowerCase()] ?? 'QWEN_MAX';
}
export function validateMVPSubagentReturn(raw) {
    if (typeof raw !== 'object' || raw === null)
        return null;
    const r = raw;
    if (typeof r.agent_type !== 'string')
        return null;
    if (typeof r.summary !== 'string')
        return null;
    if (!Array.isArray(r.key_findings))
        return null;
    if (typeof r.confidence !== 'number')
        return null;
    if (typeof r.tokens_used !== 'number')
        return null;
    return { agent_type: r.agent_type, summary: r.summary, key_findings: r.key_findings, confidence: r.confidence, tokens_used: r.tokens_used };
}
function truncateToTokens(text, maxTokens) {
    if (estimateTokens(text) <= maxTokens)
        return text;
    let result = text;
    while (result.length > 0 && estimateTokens(result) > maxTokens) {
        result = result.slice(0, -10);
    }
    return result.trim();
}
export function enforceTokenLimits(ret) {
    return {
        agent_type: ret.agent_type,
        summary: truncateToTokens(ret.summary, MAX_SUMMARY_TOKENS),
        key_findings: ret.key_findings.slice(0, MAX_FINDINGS_COUNT).map(f => truncateToTokens(f, MAX_FINDING_TOKENS)),
        confidence: Math.max(0, Math.min(1, ret.confidence)),
        tokens_used: ret.tokens_used,
    };
}
export function parseMVPSubagentOutput(raw) {
    const jsonMatch = raw.match(/\{[\s\S]*?"agent_type"[\s\S]*?\}/);
    if (!jsonMatch)
        return null;
    try {
        const parsed = JSON.parse(jsonMatch[0]);
        const validated = validateMVPSubagentReturn(parsed);
        if (!validated)
            return null;
        return enforceTokenLimits(validated);
    }
    catch {
        return null;
    }
}
export const SUBAGENT_RETURN_CONTRACT_SUFFIX = `
When you have completed your work, output your final result as a JSON object on its own line:
{"agent_type":"<your role>","summary":"<max 300 tokens>","key_findings":["<max 40 tok>","<max 40 tok>"],"confidence":<0.0-1.0>,"tokens_used":<int>}
This JSON is required. Do not skip it.`;
//# sourceMappingURL=memory-subagent-contract.js.map