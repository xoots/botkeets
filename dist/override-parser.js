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
// Pattern: optional leading whitespace, !tag, optional space/colon/dash
const OVERRIDE_RE = /^\s*!(eco|std|standard|pro|local|claude|auto)[:\s-]*/i;
/**
 * Parse any inline override prefix from `content`.
 * Returns the stripped content and the mode override (if any).
 */
export function parseOverride(content) {
    const match = content.match(OVERRIDE_RE);
    if (!match) {
        return { content, modeOverride: null, skipPlanApproval: false, parallelOverride: 1, dripFeed: false, noDrip: false, planMode: false };
    }
    const tag = match[1].toLowerCase();
    const stripped = content.slice(match[0].length).trim();
    let modeOverride;
    switch (tag) {
        case 'eco':
        case 'local':
            modeOverride = 'eco';
            break;
        case 'std':
        case 'standard':
            modeOverride = 'standard';
            break;
        case 'pro':
        case 'claude':
            modeOverride = 'pro';
            break;
        case 'auto':
            modeOverride = 'auto';
            break;
        default:
            return { content, modeOverride: null, skipPlanApproval: false, parallelOverride: 1, dripFeed: false, noDrip: false, planMode: false };
    }
    return { content: stripped, modeOverride, skipPlanApproval: false, parallelOverride: 1, dripFeed: false, noDrip: false, planMode: false };
}
// Regex matching ALL recognized override tags anywhere in a message.
// !parallel3 must come before !parallel in the alternation to avoid partial match.
const ALL_TAGS_RE = /!(parallel3|parallel|fast|nodrip|drip|plan|eco|std|standard|pro|local|claude|auto|go)[:\s-]*/gi;
/**
 * Parse ALL inline override tags from anywhere in `content`.
 * Handles: !eco, !std, !standard, !pro, !local, !claude, !auto, !go,
 *           !fast, !parallel, !parallel3
 * Tags may appear anywhere in the message, not just at the start.
 * All recognized tags are stripped from clean_content.
 * Returns a ParsedOverride with all fields populated.
 * If multiple mode tags are present, the last one found wins.
 */
export function parseOverrides(content) {
    let modeOverride = null;
    let skipPlanApproval = false;
    let parallelOverride = 1;
    let dripFeed = false;
    let noDrip = false;
    let planMode = false;
    // Reset lastIndex before each call (global regex is stateful)
    ALL_TAGS_RE.lastIndex = 0;
    const clean_content = content
        .replace(ALL_TAGS_RE, (_match, tag) => {
        const t = tag.toLowerCase();
        switch (t) {
            case 'eco':
            case 'local':
                modeOverride = 'eco';
                break;
            case 'std':
            case 'standard':
                modeOverride = 'standard';
                break;
            case 'pro':
            case 'claude':
                modeOverride = 'pro';
                break;
            case 'auto':
                modeOverride = 'auto';
                break;
            case 'fast':
                skipPlanApproval = true;
                break;
            case 'drip':
                dripFeed = true;
                break;
            case 'nodrip':
                noDrip = true;
                break;
            case 'plan':
                planMode = true;
                break;
            case 'parallel3':
                parallelOverride = 3;
                break;
            case 'parallel':
                parallelOverride = 2;
                break;
            case 'go':
                // Strip from content; signals plan/clarification resume but has no field effect
                break;
        }
        return '';
    })
        .replace(/\s+/g, ' ')
        .trim();
    return {
        content,
        modeOverride,
        skipPlanApproval,
        parallelOverride,
        dripFeed,
        noDrip,
        planMode,
        clean_content,
    };
}
//# sourceMappingURL=override-parser.js.map