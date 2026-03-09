const RESERVED_ENV_KEYS = new Set([
    'BASH_ENV',
    'CDPATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'ENV',
    'GLOBIGNORE',
    'HOME',
    'IFS',
    'LD_LIBRARY_PATH',
    'LD_PRELOAD',
    'NODE_OPTIONS',
    'NODE_PATH',
    'OLDPWD',
    'PATH',
    'PWD',
    'SHELL',
    'SHLVL',
]);
const RESERVED_ENV_PREFIXES = [
    'BASH_FUNC_',
    'DYLD_',
    'LD_',
    'NODE_DEBUG',
    'NODE_INSPECT',
    'NODE_LOADER',
    'NPM_CONFIG_',
    'npm_config_',
];
function isReservedEnvKey(key) {
    return RESERVED_ENV_KEYS.has(key)
        || RESERVED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}
export function sanitizeEnvVars(envVars, options) {
    const allowedKeys = new Set(options.allowedKeys);
    const sanitized = {};
    const keptKeys = [];
    const rejectedKeys = [];
    for (const [key, value] of Object.entries(envVars)) {
        if (!allowedKeys.has(key)) {
            rejectedKeys.push({ key, reason: 'not_allowed' });
            continue;
        }
        if (isReservedEnvKey(key)) {
            rejectedKeys.push({ key, reason: 'reserved' });
            continue;
        }
        if (typeof value !== 'string') {
            rejectedKeys.push({ key, reason: 'invalid_value' });
            continue;
        }
        sanitized[key] = value;
        keptKeys.push(key);
    }
    return { envVars: sanitized, keptKeys, rejectedKeys };
}
//# sourceMappingURL=sanitize-env-vars.js.map