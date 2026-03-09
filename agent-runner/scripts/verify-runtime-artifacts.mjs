import fs from 'fs';
import path from 'path';

import {
  SUPPORTED_WORKER_RUNNERS,
  validateWorkerRuntimeManifest,
} from './runtime-artifact-contract.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const manifestPath = path.join(rootDir, 'runtime-artifacts.json');
const distDir = path.join(rootDir, 'dist');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const availableArtifacts = fs.existsSync(distDir) ? fs.readdirSync(distDir) : [];
const validation = validateWorkerRuntimeManifest(manifest, availableArtifacts);

if (!validation.ok) {
  console.error(`Worker packaging contract mismatch. ${validation.detail}`);
  process.exit(1);
}

console.log(`Verified worker runtime artifacts (${SUPPORTED_WORKER_RUNNERS.length} runners).`);
