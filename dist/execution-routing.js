import { ASSISTANT_NAME } from './config.js';
import { getMode } from './mode-manager.js';
import { parseOverride } from './override-parser.js';
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const LEADING_TRIGGER_RE = new RegExp(`^\\s*@${escapeRegex(ASSISTANT_NAME)}\\b[\\s,:-]*`, 'i');
const LEADING_OVERRIDE_WITH_TRIGGER_RE = new RegExp(`^\\s*(!(?:eco|std|standard|pro|local|claude|auto)[:\\s-]*)@${escapeRegex(ASSISTANT_NAME)}\\b[\\s,:-]*`, 'i');
const LEADING_MENTION_BEFORE_OVERRIDE_RE = /^\s*(?:@[A-Za-z0-9_]+[\s,:-]+)+(?=!(?:eco|std|standard|pro|local|claude|auto)\b)/i;
export function hasAssistantTrigger(rawContent) {
    const normalized = rawContent.trimStart();
    return LEADING_TRIGGER_RE.test(normalized) || LEADING_OVERRIDE_WITH_TRIGGER_RE.test(normalized);
}
export function normalizeRoutingInput(rawContent) {
    let normalized = rawContent.trimStart();
    while (true) {
        const next = normalized
            .replace(LEADING_OVERRIDE_WITH_TRIGGER_RE, '$1')
            .replace(LEADING_TRIGGER_RE, '')
            .replace(LEADING_MENTION_BEFORE_OVERRIDE_RE, '')
            .trimStart();
        if (next === normalized) {
            return next;
        }
        normalized = next;
    }
}
function normalizeRecommendedMode(mode) {
    if (mode === 'eco' || mode === 'standard')
        return mode;
    if (mode === 'pro')
        return 'standard';
    return 'standard';
}
export function resolveExecutionLaneDecision(args) {
    if (!args.copaw_enabled) {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'copaw_disabled' };
    }
    if (!args.copaw_healthy) {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'copaw_unhealthy' };
    }
    if (args.needs_container) {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'requires_container' };
    }
    if (args.effective_mode === 'pro') {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'pro_mode_forces_keet' };
    }
    if (args.intent === 'complex') {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'complex_intent' };
    }
    if (args.classification?.task_type === 'code' || args.classification?.task_type === 'complex') {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'heavy_task_type' };
    }
    if (args.classification?.complexity === 'high') {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'high_complexity' };
    }
    if (args.classification?.quality_stakes === 'high' && args.classification?.task_type === 'business') {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'high_stakes_business' };
    }
    const allowedTaskType = !args.classification
        || args.classification.task_type === 'social'
        || args.classification.task_type === 'chat'
        || args.classification.task_type === 'research'
        || args.classification.task_type === 'business';
    if (!allowedTaskType) {
        return { lane: 'keet_execution', copaw_eligible: false, reason: 'task_type_not_eligible' };
    }
    return { lane: 'copaw_orchestrator', copaw_eligible: true, reason: 'light_general_task' };
}
export function resolveExecutionRoutingContext(chatJid, rawContent, classifierRecommendedMode, laneDecision) {
    const parsed = parseOverride(normalizeRoutingInput(rawContent));
    const baseMode = getMode(chatJid);
    if (parsed.modeOverride !== null) {
        if (parsed.modeOverride === 'auto') {
            return {
                requested_mode: 'auto',
                effective_mode: normalizeRecommendedMode(classifierRecommendedMode),
                source: 'inline_override',
                inline_override: 'auto',
                clean_content: parsed.content,
                lane: laneDecision?.lane,
                lane_reason: laneDecision?.reason,
                copaw_lane_eligible: laneDecision?.copaw_eligible,
            };
        }
        return {
            requested_mode: parsed.modeOverride,
            effective_mode: parsed.modeOverride,
            source: 'inline_override',
            inline_override: parsed.modeOverride,
            clean_content: parsed.content,
            lane: laneDecision?.lane,
            lane_reason: laneDecision?.reason,
            copaw_lane_eligible: laneDecision?.copaw_eligible,
        };
    }
    if (baseMode === 'auto') {
        return {
            requested_mode: 'auto',
            effective_mode: normalizeRecommendedMode(classifierRecommendedMode),
            source: 'auto_classifier',
            inline_override: null,
            clean_content: parsed.content,
            lane: laneDecision?.lane,
            lane_reason: laneDecision?.reason,
            copaw_lane_eligible: laneDecision?.copaw_eligible,
        };
    }
    return {
        requested_mode: baseMode,
        effective_mode: baseMode,
        source: 'chat_default',
        inline_override: null,
        clean_content: parsed.content,
        lane: laneDecision?.lane,
        lane_reason: laneDecision?.reason,
        copaw_lane_eligible: laneDecision?.copaw_eligible,
    };
}
//# sourceMappingURL=execution-routing.js.map