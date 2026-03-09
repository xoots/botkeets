import fs from 'fs';
import path from 'path';
import { shouldAllowLegacyReads, trackLegacyRead } from './copaw-migration.js';
const PROJECT_ROOT = process.cwd();
const METRICS_FILE = path.join(PROJECT_ROOT, 'logs', 'runtime-split.json');
function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    catch {
        return fallback;
    }
}
function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}
export function defaultRuntimeSplitMetrics() {
    return {
        keet_task_runs: 0,
        keet_lane_runs: 0,
        copaw_lane_runs: 0,
        lane_fallbacks: 0,
        lane_fallback_reasons: {},
        copaw_agent_chats: 0,
        copaw_agent_failures: 0,
        copaw_bridge_failures: 0,
        updated_at: new Date().toISOString(),
    };
}
function normalizeRuntimeSplitMetrics(raw) {
    const allowLegacyReads = shouldAllowLegacyReads();
    const hasLegacyAgentChats = raw.legacy_agent_chats !== undefined;
    const hasLegacyAgentFailures = raw.legacy_agent_failures !== undefined;
    const hasLegacyBridgeFailures = raw.legacy_bridge_failures !== undefined || raw.sidecar_failures !== undefined;
    if (allowLegacyReads && hasLegacyAgentChats) {
        trackLegacyRead('runtime_split.legacy_alias', 'legacy_agent_chats');
    }
    if (allowLegacyReads && hasLegacyAgentFailures) {
        trackLegacyRead('runtime_split.legacy_alias', 'legacy_agent_failures');
    }
    if (allowLegacyReads && hasLegacyBridgeFailures) {
        trackLegacyRead('runtime_split.legacy_alias', 'legacy_bridge_failures');
    }
    const copawAgentChats = Number(raw.copaw_agent_chats ?? (allowLegacyReads ? raw.legacy_agent_chats : 0) ?? 0);
    const copawAgentFailures = Number(raw.copaw_agent_failures ?? (allowLegacyReads ? raw.legacy_agent_failures : 0) ?? 0);
    const copawBridgeFailures = Number(raw.copaw_bridge_failures ?? (allowLegacyReads ? (raw.sidecar_failures ?? raw.legacy_bridge_failures) : 0) ?? 0);
    const laneFallbackReasonsRaw = raw.lane_fallback_reasons;
    const laneFallbackReasons = (laneFallbackReasonsRaw && typeof laneFallbackReasonsRaw === 'object')
        ? Object.fromEntries(Object.entries(laneFallbackReasonsRaw)
            .map(([key, value]) => [key, Number(value ?? 0)]))
        : {};
    return {
        keet_task_runs: Number(raw.keet_task_runs ?? 0),
        keet_lane_runs: Number(raw.keet_lane_runs ?? 0),
        copaw_lane_runs: Number(raw.copaw_lane_runs ?? 0),
        lane_fallbacks: Number(raw.lane_fallbacks ?? 0),
        lane_fallback_reasons: laneFallbackReasons,
        copaw_agent_chats: copawAgentChats,
        copaw_agent_failures: copawAgentFailures,
        copaw_bridge_failures: copawBridgeFailures,
        updated_at: String(raw.updated_at ?? new Date().toISOString()),
    };
}
export function mutateRuntimeSplitMetrics(mutator) {
    const value = normalizeRuntimeSplitMetrics(readJson(METRICS_FILE, defaultRuntimeSplitMetrics()));
    mutator(value);
    value.updated_at = new Date().toISOString();
    writeJson(METRICS_FILE, value);
    return value;
}
export function markKeetTaskRun() {
    mutateRuntimeSplitMetrics((value) => {
        value.keet_task_runs += 1;
        value.keet_lane_runs += 1;
    });
}
export function markLaneRun(lane) {
    mutateRuntimeSplitMetrics((value) => {
        if (lane === 'copaw_orchestrator')
            value.copaw_lane_runs += 1;
        else
            value.keet_lane_runs += 1;
    });
}
export function markLaneFallback(reason) {
    mutateRuntimeSplitMetrics((value) => {
        value.lane_fallbacks += 1;
        value.lane_fallback_reasons[reason] = (value.lane_fallback_reasons[reason] ?? 0) + 1;
    });
}
export function markCoPawBridgeFailure() {
    mutateRuntimeSplitMetrics((value) => {
        value.copaw_bridge_failures += 1;
    });
}
export function getRuntimeSplitMetrics() {
    return normalizeRuntimeSplitMetrics(readJson(METRICS_FILE, defaultRuntimeSplitMetrics()));
}
//# sourceMappingURL=runtime-split.js.map