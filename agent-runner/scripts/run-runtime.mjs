import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  SUPPORTED_WORKER_RUNNERS,
  validateWorkerRuntimeManifest,
} from './runtime-artifact-contract.mjs';

const APP_ROOT = '/app';
const DIST_DIR = path.join(APP_ROOT, 'dist');
const MANIFEST_PATH = path.join(APP_ROOT, 'runtime-artifacts.json');

function loadManifest() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load worker runtime manifest at ${MANIFEST_PATH}: ${detail}`);
  }

  const availableArtifacts = fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [];
  const validation = validateWorkerRuntimeManifest(parsed, availableArtifacts);
  if (!validation.ok) {
    throw new Error(validation.detail);
  }
  return validation.manifest;
}

function resolveRunner() {
  const runner = process.env.AGENT_RUNNER;
  if (typeof runner !== 'string' || !SUPPORTED_WORKER_RUNNERS.includes(runner)) {
    throw new Error(
      `AGENT_RUNNER must be one of: ${SUPPORTED_WORKER_RUNNERS.join(', ')}`,
    );
  }
  return runner;
}

async function main() {
  const manifest = loadManifest();
  const runner = resolveRunner();
  const script = manifest[runner];
  const child = spawn(process.execPath, [path.join(DIST_DIR, script)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(`[agent-runner-entrypoint] Failed to start ${runner}: ${error.message}`);
    process.exit(1);
  });
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[agent-runner-entrypoint] ${detail}`);
  process.exit(1);
});
