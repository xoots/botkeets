import fs from 'fs';
import os from 'os';
import path from 'path';
const APPROVED_TARGET_POLICIES = new Map([
    ['/workspace/group', { readonly: false }],
    ['/workspace/ipc', { readonly: false }],
    ['/home/node/.claude', { readonly: false }],
    ['/workspace/project', { readonly: false }],
    ['/workspace/global', { readonly: true }],
    ['/workspace/store', { readonly: true }],
]);
const RESERVED_TARGET_PREFIXES = [
    '/app',
    '/bin',
    '/boot',
    '/dev',
    '/etc',
    '/home',
    '/lib',
    '/lib64',
    '/proc',
    '/root',
    '/run',
    '/sbin',
    '/sys',
    '/tmp',
    '/usr',
    '/var',
    '/workspace',
];
function expandHomePath(inputPath) {
    if (!inputPath.startsWith('~'))
        return inputPath;
    if (inputPath === '~')
        return os.homedir();
    if (inputPath.startsWith('~/'))
        return path.join(os.homedir(), inputPath.slice(2));
    return inputPath;
}
export function normalizeHostMountPath(hostPath) {
    const expanded = expandHomePath(hostPath.trim());
    const resolved = path.resolve(path.normalize(expanded));
    if (!fs.existsSync(resolved)) {
        throw new Error(`Mount host path does not exist: ${resolved}`);
    }
    try {
        return fs.realpathSync.native(resolved);
    }
    catch {
        return fs.realpathSync(resolved);
    }
}
export function normalizeContainerMountPath(containerPath) {
    const raw = containerPath.trim();
    if (!raw.startsWith('/')) {
        throw new Error(`Mount target must be absolute: ${containerPath}`);
    }
    if (raw.includes('\\')) {
        throw new Error(`Mount target must use POSIX separators: ${containerPath}`);
    }
    if (/(^|\/)\.{1,2}(\/|$)/.test(raw) || raw.includes('//')) {
        throw new Error(`Mount target contains traversal-like segments: ${containerPath}`);
    }
    const normalized = path.posix.normalize(raw);
    if (normalized === '/' || normalized === '.') {
        throw new Error(`Mount target is not allowed: ${containerPath}`);
    }
    return normalized.endsWith('/') && normalized !== '/'
        ? normalized.slice(0, -1)
        : normalized;
}
function isReservedTarget(targetPath) {
    for (const approvedTarget of APPROVED_TARGET_POLICIES.keys()) {
        if (targetPath === approvedTarget)
            return false;
        if (targetPath.startsWith(`${approvedTarget}/`))
            return true;
    }
    if (targetPath.startsWith('/workspace/extra/')) {
        return false;
    }
    return RESERVED_TARGET_PREFIXES.some((prefix) => (targetPath === prefix || targetPath.startsWith(`${prefix}/`)));
}
function validateExtraTarget(targetPath, readonly) {
    if (!targetPath.startsWith('/workspace/extra/')) {
        throw new Error(`Mount target is not approved: ${targetPath}`);
    }
    const suffix = targetPath.slice('/workspace/extra/'.length);
    if (!suffix || suffix.includes('/')) {
        throw new Error(`Extra mount target must be a single safe segment: ${targetPath}`);
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(suffix)) {
        throw new Error(`Extra mount target contains unsafe characters: ${targetPath}`);
    }
    if (!readonly) {
        throw new Error(`Extra mount targets must be readonly: ${targetPath}`);
    }
}
export function validateSandboxMounts(mounts) {
    const seenTargets = new Set();
    return mounts.map((mount) => {
        const hostPath = normalizeHostMountPath(mount.hostPath);
        const containerPath = normalizeContainerMountPath(mount.containerPath);
        if (seenTargets.has(containerPath)) {
            throw new Error(`Duplicate mount target: ${containerPath}`);
        }
        seenTargets.add(containerPath);
        const approvedPolicy = APPROVED_TARGET_POLICIES.get(containerPath);
        if (approvedPolicy) {
            if (mount.readonly !== approvedPolicy.readonly) {
                throw new Error(`Mount target ${containerPath} must use readonly=${approvedPolicy.readonly}`);
            }
            return { hostPath, containerPath, readonly: mount.readonly };
        }
        if (isReservedTarget(containerPath)) {
            throw new Error(`Mount target is reserved: ${containerPath}`);
        }
        validateExtraTarget(containerPath, mount.readonly);
        return { hostPath, containerPath, readonly: mount.readonly };
    });
}
//# sourceMappingURL=validate-sandbox-security.js.map