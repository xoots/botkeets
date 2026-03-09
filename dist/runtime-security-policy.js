import path from 'path';
const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const UNSAFE_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function stripUnsafeControlChars(value) {
    return value.replace(UNSAFE_CONTROL_CHARS, '');
}
function normalizeAbsolutePosixPath(input) {
    if (!path.posix.isAbsolute(input))
        return null;
    const normalized = path.posix.normalize(input);
    if (normalized === '/' || normalized === '.')
        return null;
    return normalized;
}
export function sanitizeSecretEnvMap(input) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
        if (!ENV_VAR_NAME_PATTERN.test(key))
            continue;
        if (typeof value !== 'string')
            continue;
        sanitized[key] = stripUnsafeControlChars(value);
    }
    return sanitized;
}
export function sanitizeRuntimeMounts(mounts) {
    const sanitized = [];
    const seenContainerPaths = new Set();
    for (const mount of mounts) {
        const normalizedHostPath = path.normalize(mount.hostPath);
        const normalizedContainerPath = normalizeAbsolutePosixPath(mount.containerPath);
        if (!path.isAbsolute(normalizedHostPath) || normalizedContainerPath === null)
            continue;
        if (seenContainerPaths.has(normalizedContainerPath))
            continue;
        seenContainerPaths.add(normalizedContainerPath);
        sanitized.push({
            hostPath: normalizedHostPath,
            containerPath: normalizedContainerPath,
            readonly: mount.readonly,
        });
    }
    return sanitized;
}
export function resolveWorkspaceBoundPath(requestedPath, workspaceDir) {
    const workspaceRoot = path.resolve(workspaceDir ?? process.cwd());
    const resolvedPath = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(workspaceRoot, requestedPath);
    const relativePath = path.relative(workspaceRoot, resolvedPath);
    if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
        return resolvedPath;
    }
    return null;
}
export function resolveSafeWorkspacePath(requestedPath, workspaceDir) {
    return resolveWorkspaceBoundPath(requestedPath, workspaceDir);
}
//# sourceMappingURL=runtime-security-policy.js.map