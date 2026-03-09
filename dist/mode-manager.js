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
import { AGENT_DEFAULT_MODE } from './config.js';
import { logger } from './logger.js';
// In-memory mode store — keyed by chatJid
const activeModes = new Map();
function normalizeMode(mode) {
    return mode;
}
/**
 * Get the current mode for a chat. Falls back to the configured default.
 */
export function getMode(chatJid) {
    return normalizeMode(activeModes.get(chatJid) ?? AGENT_DEFAULT_MODE);
}
/**
 * Set a persistent mode for a chat (e.g., from a /mode command or inline override).
 */
export function setMode(chatJid, mode) {
    const normalizedMode = normalizeMode(mode);
    activeModes.set(chatJid, normalizedMode);
    logger.info({ chatJid, mode: normalizedMode, requestedMode: mode }, 'Mode set');
}
/**
 * Clear a mode override, reverting to the configured default.
 */
export function clearMode(chatJid) {
    activeModes.delete(chatJid);
    logger.info({ chatJid }, 'Mode cleared (reverted to default)');
}
/**
 * Parse a string into a Mode, returning null if unrecognised.
 */
export function parseMode(s) {
    const lower = s.toLowerCase();
    if (lower === 'eco' || lower === 'standard' || lower === 'std' || lower === 'pro' || lower === 'auto') {
        return normalizeMode(lower === 'std' ? 'standard' : lower);
    }
    return null;
}
/**
 * Return a human-readable label for UI display.
 */
export function modeLabel(mode) {
    switch (mode) {
        case 'eco': return '🌿 Eco (local only)';
        case 'standard': return '⚡ Standard (balanced)';
        case 'pro': return '🔥 Pro (max quality)';
        case 'auto': return '🤖 Auto (smart routing)';
    }
}
//# sourceMappingURL=mode-manager.js.map