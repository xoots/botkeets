import type { MVPSubagentReturn } from './memory-types.js';
import type { ModelTier } from './memory-types.js';
export declare const MODEL_TIER_BY_AGENT_TYPE: Record<string, ModelTier>;
export declare function resolveModelTierFromAgentType(agentType: string): ModelTier;
export declare function validateMVPSubagentReturn(raw: unknown): MVPSubagentReturn | null;
export declare function enforceTokenLimits(ret: MVPSubagentReturn): MVPSubagentReturn;
export declare function parseMVPSubagentOutput(raw: string): MVPSubagentReturn | null;
export declare const SUBAGENT_RETURN_CONTRACT_SUFFIX = "\nWhen you have completed your work, output your final result as a JSON object on its own line:\n{\"agent_type\":\"<your role>\",\"summary\":\"<max 300 tokens>\",\"key_findings\":[\"<max 40 tok>\",\"<max 40 tok>\"],\"confidence\":<0.0-1.0>,\"tokens_used\":<int>}\nThis JSON is required. Do not skip it.";
//# sourceMappingURL=memory-subagent-contract.d.ts.map