// Lightweight Provider Strategy for NanoClaw
import { execSync } from 'child_process';
import { logger } from './logger.js';
import { PRIMARY_PROVIDER, FALLBACK_CHAIN } from './config.js';
const RATE_LIMIT_REGEX = [
    /rate_limit_error/i,
    /usage_limit/i,
    /overloaded_error/i,
    /You exceeded your current quota/i,
    /exceeded your current quota/i,
    /429 You exceeded your current quota/i,
    /rate limit hit/i,
    /hit your limit/i
];
const CONTEXT_OVERFLOW_REGEX = [
    /maximum context length/i,
    /context_length_exceeded/i,
    /request is too large/i,
    /too many tokens/i,
];
const PROVIDER_UNAVAILABLE_REGEX = [
    /no endpoints found/i,
    /model .* not found/i,
    /not a valid model/i,
];
// Simple failure tracking
const providerFailures = {};
export function isRateLimitError(text) {
    return RATE_LIMIT_REGEX.some((re) => re.test(text)) ||
        CONTEXT_OVERFLOW_REGEX.some((re) => re.test(text));
}
export function isContextOverflowError(text) {
    return CONTEXT_OVERFLOW_REGEX.some((re) => re.test(text));
}
export function isProviderUnavailableError(text) {
    return PROVIDER_UNAVAILABLE_REGEX.some((re) => re.test(text));
}
export function isProviderActive(groupFolder, entry) {
    const groupFailures = providerFailures[groupFolder];
    if (!groupFailures)
        return true;
    const failUntil = groupFailures[entry];
    if (!failUntil)
        return true;
    if (failUntil > Date.now())
        return false;
    delete groupFailures[entry];
    return true;
}
export function deactivateProvider(groupFolder, entry, durationMs = 3600000) {
    if (!providerFailures[groupFolder])
        providerFailures[groupFolder] = {};
    providerFailures[groupFolder][entry] = Date.now() + durationMs;
    logger.info({ groupFolder, entry, durationMins: Math.ceil(durationMs / 60000) }, 'Provider deactivated');
}
export function selectActiveProvider(groupFolder, chain) {
    const currentChain = chain ?? [PRIMARY_PROVIDER, ...FALLBACK_CHAIN.filter(p => p !== PRIMARY_PROVIDER)];
    const activeChain = currentChain.filter((entry) => isProviderActive(groupFolder, entry));
    return {
        provider: activeChain[0] ?? currentChain[0],
        activeChain: activeChain.length > 0 ? activeChain : currentChain
    };
}
// Check if Ollama is running locally
export function isOllamaAvailable() {
    try {
        execSync('curl -s http://localhost:11434/api/tags', { stdio: 'ignore', timeout: 3000 });
        return true;
    }
    catch {
        return false;
    }
}
export function buildRuntimeContextMd(groupFolder, provider, activeChain, extras) {
    const lines = [
        '## Runtime Context',
        '',
        `**Active provider:** ${provider}`,
        `**Provider chain:** ${activeChain.join(' → ')}`,
        `**Ollama available:** ${isOllamaAvailable() ? 'Yes' : 'No'}`
    ];
    const groupFailures = providerFailures[groupFolder];
    if (groupFailures) {
        const rateLimited = Object.entries(groupFailures)
            .filter(([, failUntil]) => failUntil > Date.now())
            .map(([p, failUntil]) => {
            const minsLeft = Math.ceil((failUntil - Date.now()) / 60_000);
            return `  - ${p}: rate-limited, recovers in ~${minsLeft} min`;
        });
        if (rateLimited.length > 0) {
            lines.push('', '**Rate-limited providers:**', ...rateLimited);
        }
    }
    if (extras) {
        lines.push('');
        for (const [key, value] of Object.entries(extras)) {
            lines.push(`**${key}:** ${value}`);
        }
    }
    lines.push('', '_Auto-generated before each session._');
    return lines.join('\n');
}
//# sourceMappingURL=provider-strategy.js.map