import fs from 'fs';
import path from 'path';
import { validateWorkerRuntimeManifest } from '../agent-runner/scripts/runtime-artifact-contract.mjs';
import { getKeetProviderCapability, resolvePrimaryProviderForMode, resolveEffectiveOllamaModel } from './keet-provider-config.js';
import { logger } from './logger.js';
const RUNTIME_ARTIFACT_MANIFEST_PATH = path.join(process.cwd(), 'agent-runner', 'runtime-artifacts.json');
const RUNTIME_ARTIFACT_DIST_PATH = path.join(process.cwd(), 'agent-runner', 'dist');
function loadRuntimeArtifactManifest() {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(RUNTIME_ARTIFACT_MANIFEST_PATH, 'utf-8'));
    }
    catch (err) {
        throw new Error(`Failed to load worker runtime manifest at ${RUNTIME_ARTIFACT_MANIFEST_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const availableArtifacts = fs.existsSync(RUNTIME_ARTIFACT_DIST_PATH) ? fs.readdirSync(RUNTIME_ARTIFACT_DIST_PATH) : [];
    const validation = validateWorkerRuntimeManifest(parsed, availableArtifacts);
    if (!validation.ok) {
        throw new Error(validation.detail);
    }
    return validation.manifest;
}
const runtimeArtifactManifest = loadRuntimeArtifactManifest();
/**
 * Pure mapping of Runner → container script name and API key env var.
 * Exported so runContainerPrompt() can use it directly for step-level routing.
 */
export function runnerToScriptInfo(runner) {
    switch (runner) {
        case 'ollama':
            return { script: runtimeArtifactManifest.ollama, providerKeyEnv: 'OLLAMA_API_KEY', modelEnvVar: 'OLLAMA_MODEL' };
        case 'claude':
            return { script: runtimeArtifactManifest.claude, providerKeyEnv: 'CLAUDE_CODE_OAUTH_TOKEN' };
        case 'openrouter':
            return { script: runtimeArtifactManifest.openrouter, providerKeyEnv: 'OPENROUTER_API_KEY', modelEnvVar: 'OPENROUTER_MODEL' };
        case 'dashscope':
            return { script: runtimeArtifactManifest.dashscope, providerKeyEnv: 'DASHSCOPE_API_KEY', modelEnvVar: 'DASHSCOPE_MODEL' };
        case 'deepseek':
            return { script: runtimeArtifactManifest.deepseek, providerKeyEnv: 'DEEPSEEK_API_KEY', modelEnvVar: 'DEEPSEEK_MODEL' };
        default: {
            // TypeScript exhaustiveness guard
            const _exhaustive = runner;
            void _exhaustive;
            return { script: runtimeArtifactManifest.claude, providerKeyEnv: 'CLAUDE_CODE_OAUTH_TOKEN' };
        }
    }
}
/** Normalize provider string: 'anthropic' → 'claude', pass all others through. */
function normalizeToRunner(provider) {
    if (provider === 'anthropic')
        return 'claude';
    if (provider === 'ollama' ||
        provider === 'claude' ||
        provider === 'openrouter' ||
        provider === 'dashscope' ||
        provider === 'deepseek') {
        return provider;
    }
    // Unknown provider — default to claude
    return 'claude';
}
/** Reverse normalization for capability check: 'claude' → 'anthropic'. */
function toCapabilityId(runner) {
    return runner === 'claude' ? 'anthropic' : runner;
}
/**
 * Single authority function for runtime selection.
 * Every call site in the codebase must use this function instead of
 * making independent runner/provider decisions.
 *
 * Input priority:
 *   1. ProviderPlan (from mode-router, if available — most specific)
 *   2. ExecutionRoutingContext.effective_mode (fallback when no plan)
 *   3. Provider capability check (guards against misconfigured providers)
 */
export function resolveRuntime(routingContext, providerPlan) {
    let runner;
    let model;
    let source;
    if (providerPlan) {
        // Priority 1: use ProviderPlan's primary provider
        runner = normalizeToRunner(providerPlan.provider);
        model = providerPlan.model;
        source = 'provider_plan';
    }
    else {
        // Priority 2: derive from effective_mode
        const resolved = resolvePrimaryProviderForMode(routingContext.effective_mode);
        runner = normalizeToRunner(resolved.provider_id);
        model = resolved.model;
        source = 'mode_default';
    }
    // Priority 3: capability guard — verify provider is compatible_with_keet
    const capability = getKeetProviderCapability(toCapabilityId(runner));
    if (!capability.compatible_with_keet) {
        let found = false;
        // Walk providerPlan fallbacks first
        if (providerPlan?.fallbacks && providerPlan.fallbacks.length > 0) {
            for (const fb of providerPlan.fallbacks) {
                const fbRunner = normalizeToRunner(fb.provider);
                const fbCap = getKeetProviderCapability(toCapabilityId(fbRunner));
                if (fbCap.compatible_with_keet) {
                    runner = fbRunner;
                    model = fb.model;
                    source = `fallback(${fb.provider})`;
                    found = true;
                    break;
                }
            }
        }
        // Final safety net: local ollama
        if (!found) {
            const ollamaResolved = resolveEffectiveOllamaModel(process.env.OLLAMA_MODEL || 'qwen3:8b');
            runner = 'ollama';
            model = ollamaResolved.model;
            source = 'ollama_safety_fallback';
        }
    }
    const { script, providerKeyEnv } = runnerToScriptInfo(runner);
    const lane = routingContext.lane ?? 'keet_execution';
    const reason = `${source}: ${runner}/${model} (mode=${routingContext.effective_mode}, lane=${lane})`;
    logger.debug({ runner, model, reason }, '[resolveRuntime]');
    return {
        runner,
        model,
        containerScript: script,
        providerKeyEnv,
        reason,
        routingContext,
        providerPlan,
    };
}
//# sourceMappingURL=runtime-resolver.js.map