/**
 * Provider Registry
 *
 * Dynamic source of truth for routing tiers.
 * Registry entries resolve lazily so KEET-local env/config changes can
 * override defaults without requiring a process restart.
 */
export interface ModelEntry {
    provider: 'ollama' | 'claude' | 'dashscope' | 'openrouter' | 'deepseek';
    model: string;
}
type RegistryKey = 'eco_chat' | 'eco_tiny' | 'eco_coder' | 'std_chat' | 'std_coder' | 'std_coder_flash' | 'pro_reason' | 'pro_claude' | 'pro_or' | 'pro_claude_coder' | 'eco_brain' | 'std_brain' | 'pro_brain';
export declare const REGISTRY: {
    readonly eco_chat: ModelEntry;
    readonly eco_tiny: ModelEntry;
    readonly eco_coder: ModelEntry;
    readonly std_chat: ModelEntry;
    readonly std_coder: ModelEntry;
    readonly std_coder_flash: ModelEntry;
    readonly pro_reason: ModelEntry;
    readonly pro_claude: ModelEntry;
    readonly pro_or: ModelEntry;
    readonly pro_claude_coder: ModelEntry;
    readonly eco_brain: ModelEntry;
    readonly std_brain: ModelEntry;
    readonly pro_brain: ModelEntry;
};
/** Fallback chains per tier — ordered by preference */
export declare const FALLBACK_CHAINS: {
    readonly eco: ModelEntry[];
    readonly standard: ModelEntry[];
    readonly pro: ModelEntry[];
    readonly coding: ModelEntry[];
    readonly coding_pro: ModelEntry[];
    readonly overseer: ModelEntry[];
    readonly planner: ModelEntry[];
};
export type { RegistryKey };
//# sourceMappingURL=provider-registry.d.ts.map