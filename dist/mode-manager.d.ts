/**
 * Mode Manager
 *
 * Tracks the active routing mode per chat JID.
 * Modes control which model tier handles each request:
 *
 *   eco      → local models only (qwen3:8b, smollm2) — zero cloud cost
 *   standard → Haiku/Perplexity for quality + local for social (balanced)
 *   pro      → Claude-first, OpenRouter Auto for fallback (max quality)
 *   auto     → qwen3:8b classifies intent, picks mode per message (default)
 */
export type Mode = 'eco' | 'standard' | 'pro' | 'auto';
/**
 * Get the current mode for a chat. Falls back to the configured default.
 */
export declare function getMode(chatJid: string): Mode;
/**
 * Set a persistent mode for a chat (e.g., from a /mode command or inline override).
 */
export declare function setMode(chatJid: string, mode: Mode): void;
/**
 * Clear a mode override, reverting to the configured default.
 */
export declare function clearMode(chatJid: string): void;
/**
 * Parse a string into a Mode, returning null if unrecognised.
 */
export declare function parseMode(s: string): Mode | null;
/**
 * Return a human-readable label for UI display.
 */
export declare function modeLabel(mode: Mode): string;
//# sourceMappingURL=mode-manager.d.ts.map