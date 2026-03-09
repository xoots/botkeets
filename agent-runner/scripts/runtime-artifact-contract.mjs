import path from 'node:path';

export const SUPPORTED_WORKER_RUNNERS = Object.freeze([
  'claude',
  'openrouter',
  'dashscope',
  'deepseek',
  'ollama',
]);

const SUPPORTED_WORKER_RUNNER_SET = new Set(SUPPORTED_WORKER_RUNNERS);

function normalizeArtifactNames(availableArtifacts) {
  if (!availableArtifacts) return null;
  const normalized = new Set();
  for (const artifact of availableArtifacts) {
    if (typeof artifact !== 'string') continue;
    normalized.add(path.basename(artifact));
  }
  return normalized;
}

export function validateWorkerRuntimeManifest(manifest, availableArtifacts) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, detail: 'Worker runtime manifest must be a JSON object' };
  }

  const entries = manifest;
  const keys = Object.keys(entries).sort();
  const expectedKeys = [...SUPPORTED_WORKER_RUNNERS].sort();

  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return {
      ok: false,
      detail: `Worker runtime manifest must contain exactly: ${SUPPORTED_WORKER_RUNNERS.join(', ')}`,
    };
  }

  const artifactNames = normalizeArtifactNames(availableArtifacts);

  for (const runner of SUPPORTED_WORKER_RUNNERS) {
    if (!SUPPORTED_WORKER_RUNNER_SET.has(runner)) {
      return { ok: false, detail: `Worker runtime manifest entry is invalid for runner '${runner}'` };
    }
    const script = entries[runner];
    if (typeof script !== 'string' || path.basename(script) !== script || !script.endsWith('.js')) {
      return {
        ok: false,
        detail: `Worker runtime manifest entry is invalid for runner '${runner}'`,
      };
    }
    if (artifactNames && !artifactNames.has(script)) {
      return {
        ok: false,
        detail: `Worker runtime manifest entry has no matching dist artifact for runner '${runner}': ${script}`,
      };
    }
  }

  return { ok: true, manifest: entries };
}
