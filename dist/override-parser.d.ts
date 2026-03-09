/**
 * Override Parser
 *
 * Strips optional inline mode/provider override tags from message content
 * and returns both the cleaned text and the requested override.
 *
 * Supported prefixes (case-insensitive):
 *   !eco      → force ECO mode for this message only
 *   !std      → force STANDARD mode for this message only
 *   !standard → force STANDARD mode for this message only
 *   !pro      → force PRO mode for this message only
 *   !local    → alias for ECO (local model only)
 *   !claude   → alias for PRO mode
 *   !auto     → keep auto-routing but force autonomous execution mode for containers
 *   !plan     → pause after planning to show interactive model/budget picker UI
 *
 * The prefix can appear at the start of the message, optionally followed by
 * a space or colon. Example: "!pro: write me a Spotify headless app"
 */
import { Mode } from './mode-manager.js';
export interface ParsedOverride {
    /** The cleaned message content with the override tag removed */
    content: string;
    /** The requested mode override, or null if no override was found */
    modeOverride: Mode | null;
    /** true when !fast is present — skip plan approval gate */
    skipPlanApproval: boolean;
    /** 1 = default sequential, 2 = !parallel, 3 = !parallel3 */
    parallelOverride: 1 | 2 | 3;
    /** true when !drip is present — force drip-feed execution path */
    dripFeed: boolean;
    /** true when !nodrip is present — disable drip-feed auto-activation */
    noDrip: boolean;
    /** true when !plan is present — pause after planning to show interactive UI */
    planMode: boolean;
}
/**
 * Parse any inline override prefix from `content`.
 * Returns the stripped content and the mode override (if any).
 */
export declare function parseOverride(content: string): ParsedOverride;
/**
 * Parse ALL inline override tags from anywhere in `content`.
 * Handles: !eco, !std, !standard, !pro, !local, !claude, !auto, !go,
 *           !fast, !parallel, !parallel3
 * Tags may appear anywhere in the message, not just at the start.
 * All recognized tags are stripped from clean_content.
 * Returns a ParsedOverride with all fields populated.
 * If multiple mode tags are present, the last one found wins.
 */
export declare function parseOverrides(content: string): ParsedOverride & {
    clean_content: string;
};
//# sourceMappingURL=override-parser.d.ts.map