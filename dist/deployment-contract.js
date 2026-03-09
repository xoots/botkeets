import fs from 'fs';
import path from 'path';
import { exec, spawnSync } from 'child_process';
import { promisify } from 'util';
import { SUPPORTED_WORKER_RUNNERS, validateWorkerRuntimeManifest, } from '../agent-runner/scripts/runtime-artifact-contract.mjs';
const execAsync = promisify(exec);
const PROJECT_ROOT = process.cwd();
const WORKER_ROOT = path.join(PROJECT_ROOT, 'agent-runner');
const WORKER_DIST_DIR = path.join(WORKER_ROOT, 'dist');
const WORKER_MANIFEST_PATH = path.join(WORKER_ROOT, 'runtime-artifacts.json');
export { SUPPORTED_WORKER_RUNNERS };
export { validateWorkerRuntimeManifest };
const WORKER_SOURCE_BUILD_COMMAND = 'cd agent-runner && npm run build';
const WORKER_SOURCE_BUILD_TIMEOUT_MS = 120_000;
function summarizeCommandOutput(output) {
    const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const summary = lines.slice(-5).join(' | ');
    return summary.length > 280 ? `${summary.slice(0, 277)}...` : summary;
}
export function getSupportedBuildContract() {
    return [
        {
            code: 'root_app_and_worker_package',
            command: 'npm run build',
            detail: 'Compile the root app and build or verify the shipped worker package in agent-runner/.',
        },
        {
            code: 'worker_image',
            command: 'npm run image:build',
            detail: 'Build the worker container image through container/build.sh and container/Dockerfile using the agent-runner/ build context.',
        },
    ];
}
export function getDeploymentContractExpectations(settings) {
    return {
        container_runtime: settings.requireContainerRuntime,
        worker_package: settings.requireAgentImage,
        agent_image: settings.requireAgentImage,
        classifier_sidecar: settings.requireClassifierSidecar,
    };
}
export function getRequiredDeploymentBlockers(checks) {
    return checks
        .filter((check) => check.required && !check.ok)
        .map((check) => ({
        code: check.code,
        detail: check.detail,
    }));
}
async function commandOk(command) {
    try {
        await execAsync(command, { timeout: 3_000 });
        return true;
    }
    catch {
        return false;
    }
}
async function httpOk(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
        return response.ok;
    }
    catch {
        return false;
    }
}
function imageAvailableViaListing(imageRef, listing) {
    const repoTag = imageRef.trim();
    const repoOnly = repoTag.split(':')[0];
    if (!repoOnly)
        return false;
    return listing.includes(repoTag) || listing.includes(repoOnly);
}
function getWorkerPackageState() {
    if (!fs.existsSync(WORKER_MANIFEST_PATH)) {
        return {
            ok: false,
            detail: `Missing worker runtime manifest at ${path.relative(PROJECT_ROOT, WORKER_MANIFEST_PATH)}`,
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(WORKER_MANIFEST_PATH, 'utf-8'));
    }
    catch (err) {
        return {
            ok: false,
            detail: `Worker runtime manifest is unreadable: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    const manifestResult = validateWorkerRuntimeManifest(parsed);
    if (!manifestResult.ok) {
        return {
            ok: false,
            detail: manifestResult.detail,
        };
    }
    const availableArtifacts = fs.existsSync(WORKER_DIST_DIR) ? fs.readdirSync(WORKER_DIST_DIR) : [];
    const artifactValidation = validateWorkerRuntimeManifest(parsed, availableArtifacts);
    if (!artifactValidation.ok) {
        return {
            ok: false,
            detail: artifactValidation.detail,
        };
    }
    return {
        ok: true,
        detail: `Worker package is present (${path.relative(PROJECT_ROOT, WORKER_MANIFEST_PATH)})`,
    };
}
export async function getWorkerSourceBuildState() {
    const workerNodeModulesDir = path.join(WORKER_ROOT, 'node_modules');
    if (!fs.existsSync(workerNodeModulesDir)) {
        return {
            ok: false,
            detail: `Worker source build dependencies are missing (${path.relative(PROJECT_ROOT, workerNodeModulesDir)}); run ${WORKER_SOURCE_BUILD_COMMAND}`,
        };
    }
    const result = spawnSync('npm', ['run', 'build'], {
        cwd: WORKER_ROOT,
        encoding: 'utf-8',
        timeout: WORKER_SOURCE_BUILD_TIMEOUT_MS,
    });
    if (typeof result.status === 'number' && result.status === 0) {
        return {
            ok: true,
            detail: `Worker source build passed via ${WORKER_SOURCE_BUILD_COMMAND}`,
        };
    }
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    const summary = summarizeCommandOutput(output);
    const exitStatus = result.status ?? 'unknown';
    const failureDetail = result.error?.message ?? (summary || `exit status ${exitStatus}`);
    return {
        ok: false,
        detail: `Worker source build failed via ${WORKER_SOURCE_BUILD_COMMAND}: ${failureDetail}`,
    };
}
export async function getDeploymentReadinessChecks(settings, deps = {}) {
    const checks = [];
    const checkCommand = deps.commandOk ?? commandOk;
    const checkHttp = deps.httpOk ?? httpOk;
    const getPackageState = deps.getWorkerPackageState ?? getWorkerPackageState;
    const getSourceBuildState = deps.getWorkerSourceBuildState ?? getWorkerSourceBuildState;
    const listImages = deps.listImages ?? (async (runtimeBin) => {
        try {
            const { stdout } = await execAsync(`${runtimeBin} images`, { timeout: 4_000 });
            return stdout || '';
        }
        catch {
            const { stdout } = await execAsync(`${runtimeBin} image list`, { timeout: 4_000 });
            return stdout || '';
        }
    });
    const runtimeBinaryAvailable = await checkCommand(`${settings.containerRuntimeBin} --version`)
        || await checkCommand(`${settings.containerRuntimeBin} version`);
    checks.push({
        code: 'container_runtime_binary',
        required: settings.requireContainerRuntime,
        ok: runtimeBinaryAvailable,
        detail: `${settings.containerRuntimeBin} CLI is ${runtimeBinaryAvailable ? 'available' : 'missing'}`,
    });
    const runtimeReachable = await checkCommand(`${settings.containerRuntimeBin} info`)
        || await checkCommand(`${settings.containerRuntimeBin} ps`)
        || await checkCommand(`${settings.containerRuntimeBin} list`);
    checks.push({
        code: 'container_runtime_reachable',
        required: settings.requireContainerRuntime,
        ok: runtimeReachable,
        detail: runtimeReachable
            ? `${settings.containerRuntimeBin} daemon is reachable`
            : `${settings.containerRuntimeBin} daemon is unavailable`,
    });
    const workerPackageState = getPackageState();
    checks.push({
        code: 'worker_package',
        required: settings.requireAgentImage,
        ok: workerPackageState.ok,
        detail: workerPackageState.detail,
    });
    const workerSourceBuildState = await getSourceBuildState();
    checks.push({
        code: 'worker_source_build',
        required: settings.requireAgentImage,
        ok: workerSourceBuildState.ok,
        detail: workerSourceBuildState.detail,
    });
    let imageAvailable = false;
    try {
        imageAvailable = imageAvailableViaListing(settings.containerImage, await listImages(settings.containerRuntimeBin));
    }
    catch {
        imageAvailable = false;
    }
    checks.push({
        code: 'container_agent_image',
        required: settings.requireAgentImage,
        ok: imageAvailable,
        detail: imageAvailable
            ? `Agent image ${settings.containerImage} is available`
            : `Agent image ${settings.containerImage} is missing`,
    });
    const classifierHealthy = await checkHttp('http://127.0.0.1:8765/health');
    checks.push({
        code: 'classifier_sidecar_health',
        required: settings.requireClassifierSidecar,
        ok: classifierHealthy,
        detail: classifierHealthy
            ? 'Classifier sidecar is healthy'
            : 'Classifier sidecar is not reachable at http://127.0.0.1:8765/health',
    });
    return checks;
}
//# sourceMappingURL=deployment-contract.js.map