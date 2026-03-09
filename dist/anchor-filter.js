import { existsSync, readFileSync } from 'fs';
import { getEncoding } from 'js-tiktoken';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readCoPawMemoryRecord } from './copaw-system.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHOR_CAP = 0.47;
const MODE_CONTEXT_TOKENS = {
    pro: 200_000, // claude-sonnet-4-5 supports 200k
    standard: 128_000, // deepseek/qwen standard providers — 128k safe limit
    eco: 32_000, // qwen3:8b local — 32k context window
    local: 32_000, // qwen3:8b local — 32k context window
    auto: 200_000, // Auto reuses the standard anchor budget
};
const MODE_ANCHOR_FILES = {
    pro: 'anchor-pro.md',
    standard: 'anchor-standard.md',
    eco: 'anchor-eco.md',
    local: 'anchor-local.md',
    auto: 'anchor-standard.md',
};
const MODE_USER_CONTEXT_FILES = {
    pro: ['preferences.md', 'active-projects.md', 'failure-modes.md', 'recent-decisions.md'],
    standard: ['preferences.md', 'active-projects.md'],
    eco: ['preferences.md'],
    local: [],
    auto: ['preferences.md', 'active-projects.md'],
};
const USER_CONTEXT_DIR = join(__dirname, '../memory/user_context');
const KEET_MEMORY_NAMESPACE = 'keet';
function resolveAnchorDirectory() {
    const candidates = [
        join(__dirname, 'anchor-files'),
        join(__dirname, '../src/anchor-files'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return candidates[0];
}
function loadRequiredFile(filePath, label) {
    if (!existsSync(filePath)) {
        throw new Error(`${label} not found: ${filePath}`);
    }
    return readFileSync(filePath, 'utf8');
}
function buildUserContext(mode) {
    if (mode === 'local')
        return '';
    const sections = [];
    for (const fileName of MODE_USER_CONTEXT_FILES[mode]) {
        const memoryRecord = readCoPawMemoryRecord({
            namespace: KEET_MEMORY_NAMESPACE,
            descriptor: `user_context/${fileName}`,
            legacyPath: join(USER_CONTEXT_DIR, fileName),
            migrateLegacy: true,
        });
        const content = memoryRecord.content.trim();
        if (!content)
            continue;
        sections.push(`## ${fileName}\n${content}`);
    }
    return sections.join('\n\n');
}
function truncateToBudget(text, maxTokens) {
    if (!text || maxTokens <= 0)
        return '';
    const enc = getEncoding('cl100k_base');
    if (enc.encode(text).length <= maxTokens)
        return text;
    let low = 0;
    let high = text.length;
    let best = '';
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = text.slice(0, mid).trimEnd();
        const tokens = enc.encode(candidate).length;
        if (tokens <= maxTokens) {
            best = candidate;
            low = mid + 1;
        }
        else {
            high = mid - 1;
        }
    }
    return best;
}
export function loadAnchor(mode) {
    const anchorDir = resolveAnchorDirectory();
    const anchorFile = join(anchorDir, MODE_ANCHOR_FILES[mode]);
    const anchorContent = loadRequiredFile(anchorFile, `Anchor file for mode '${mode}'`);
    const capTokens = Math.floor(MODE_CONTEXT_TOKENS[mode] * ANCHOR_CAP);
    const enc = getEncoding('cl100k_base');
    const anchorTokens = enc.encode(anchorContent).length;
    if (anchorTokens > capTokens) {
        throw new Error(`Anchor file for mode '${mode}' exceeds 47% cap: ${anchorTokens} > ${capTokens}. Reduce the anchor file size.`);
    }
    const initialUserContext = buildUserContext(mode);
    const remainingBudget = Math.max(0, capTokens - anchorTokens);
    const userContext = mode === 'local'
        ? ''
        : truncateToBudget(initialUserContext, remainingBudget);
    const userContextTokens = enc.encode(userContext).length;
    const totalTokens = anchorTokens + userContextTokens;
    return {
        anchorContent,
        userContext,
        totalTokens,
        capTokens,
        capRespected: totalTokens <= capTokens,
        mode,
    };
}
//# sourceMappingURL=anchor-filter.js.map