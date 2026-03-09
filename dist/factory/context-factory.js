import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
const DEFAULT_COMMIT_LIMIT = 12;
function dedupe(values) {
    return [...new Set(values)];
}
function filePath(rootDir, relativePath) {
    return path.join(rootDir, relativePath);
}
function readUtf8(rootDir, relativePath) {
    return readFileSync(filePath(rootDir, relativePath), 'utf8');
}
function writeIfChanged(rootDir, relativePath, content) {
    const absolutePath = filePath(rootDir, relativePath);
    const normalized = content.endsWith('\n') ? content : `${content}\n`;
    const current = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
    if (current === normalized)
        return false;
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, normalized, 'utf8');
    return true;
}
function compact(text) {
    return text.replace(/\s+/g, ' ').trim();
}
function parseDecisions(markdown) {
    const lines = markdown.split('\n');
    const items = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('-'))
            continue;
        if (!trimmed.includes('|'))
            continue;
        const raw = trimmed.replace(/^-+\s*/, '');
        const parts = raw.split('|').map((part) => compact(part));
        if (parts.length < 2)
            continue;
        const dateMatch = parts[0].match(/\[(\d{4}-\d{2}-\d{2})\]/);
        const hasDate = Boolean(dateMatch);
        const date = dateMatch?.[1] ?? 'locked';
        const decision = hasDate ? (parts[1] ?? 'unknown') : (parts[0] ?? 'unknown');
        const rationale = hasDate ? (parts[2] ?? '') : (parts[1] ?? '');
        items.push({
            date,
            decision,
            rationale,
        });
    }
    return items;
}
function getRecentCommits(rootDir, limit) {
    try {
        const output = execFileSync('git', ['log', '--date=short', `--pretty=format:%h|%ad|%s`, '-n', String(limit)], { cwd: rootDir, encoding: 'utf8' });
        return output
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
            const [hash = '', date = '', subject = ''] = line.split('|');
            return { hash, date, subject };
        })
            .filter((item) => item.hash && item.date && item.subject);
    }
    catch {
        return [];
    }
}
function parseProviderDefaults(source) {
    const match = source.match(/const DEFAULTS:[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
    if (!match)
        return [];
    const defaultsBlock = match[1];
    const lineRegex = /(\w+):\s*\{\s*provider:\s*'([^']+)'\s*,\s*model:\s*([^}]+)\}\s*,?/g;
    const providers = [];
    let entry = lineRegex.exec(defaultsBlock);
    while (entry) {
        const [, key, provider, modelExpr] = entry;
        const modelMatch = modelExpr.match(/'([^']+)'/g);
        const quoted = modelMatch?.map((part) => part.replace(/'/g, '')) ?? [];
        const modelDefault = quoted.length > 0 ? quoted[quoted.length - 1] : compact(modelExpr);
        providers.push({ key, provider, modelDefault });
        entry = lineRegex.exec(defaultsBlock);
    }
    return providers;
}
function parseFallbackChains(source) {
    const chains = [];
    const regex = /get\s+(\w+)\(\):\s*ModelEntry\[\]\s*\{\s*return\s*\[([^\]]*)\];\s*\}/g;
    let match = regex.exec(source);
    while (match) {
        const chain = match[1];
        const targets = match[2]
            .split(',')
            .map((item) => compact(item))
            .filter(Boolean);
        chains.push({ chain, targets });
        match = regex.exec(source);
    }
    return chains;
}
function renderAnchorRecentDecisions(decisions, commits) {
    const lines = ['# Recent Decisions', ''];
    for (const decision of decisions.slice(0, 8)) {
        const suffix = decision.rationale ? ` (${decision.rationale})` : '';
        lines.push(`- [${decision.date}] ${decision.decision}${suffix}`);
    }
    if (commits.length > 0) {
        lines.push('', '## Recent Repository Activity', '');
        for (const commit of commits.slice(0, 6)) {
            lines.push(`- ${commit.date} \`${commit.hash}\` ${commit.subject}`);
        }
    }
    else {
        lines.push('', '- Git history unavailable in current workspace snapshot.');
    }
    return lines.join('\n');
}
function renderAnchorActiveProjects(providers, chains) {
    const lines = ['# Active Projects', '', '## Routing Registry Snapshot', ''];
    for (const provider of providers.slice(0, 12)) {
        lines.push(`- ${provider.key}: ${provider.provider}/${provider.modelDefault}`);
    }
    lines.push('', '## Fallback Chains', '');
    for (const chain of chains) {
        lines.push(`- ${chain.chain}: ${chain.targets.join(' -> ') || '(none)'}`);
    }
    lines.push('', '## Current Focus', '', '- Keep CoPaw as conversation/orchestration and KEET as routing/context authority.', '- Keep Trigger as async task runtime and reuse standard-mode task semantics.');
    return lines.join('\n');
}
function renderAnchorFailureModes(providers, commits) {
    const providerFamilies = dedupe(providers.map((provider) => provider.provider));
    const lines = ['# Failure Modes', ''];
    lines.push('- Context drift from stale `memory/user_context` documents or missing refresh cycle.');
    lines.push('- Provider routing mismatch when registry defaults drift from real credentials.');
    lines.push(`- Multi-provider instability risk across: ${providerFamilies.join(', ') || 'unknown providers'}.`);
    lines.push('- Trigger dispatch accepted but background run fails without surfaced terminal summary.');
    if (commits.length > 0) {
        lines.push(`- Fast commit churn (${commits.length} sampled commits) can stale anchor summaries between runs.`);
    }
    return lines.join('\n');
}
function renderUserRecentDecisions(decisions, commits, now) {
    const lines = ['## Recent Decisions', '<!-- Date | Decision | Rationale — auto-generated -->', ''];
    for (const decision of decisions.slice(0, 12)) {
        lines.push(`- ${decision.date} | ${decision.decision} | ${decision.rationale || 'n/a'}`);
    }
    if (commits.length > 0) {
        lines.push('', '## Recent Commits', '<!-- date | hash | subject -->');
        for (const commit of commits.slice(0, 8)) {
            lines.push(`- ${commit.date} | ${commit.hash} | ${commit.subject}`);
        }
    }
    lines.push('', `<!-- generated_at=${now.toISOString()} -->`);
    return lines.join('\n');
}
function renderUserActiveProjects(providers, chains, now) {
    const lines = ['## Active Projects', '<!-- project name | stack | current focus | recent decisions -->', '', '- KEET Factory Agents | TypeScript + Trigger + Markdown docs | keep anchors and user context fresh | synced from DECISIONS/provider registry/git history', '', '## Provider Registry', ''];
    for (const provider of providers.slice(0, 16)) {
        lines.push(`- ${provider.key} | ${provider.provider} | ${provider.modelDefault}`);
    }
    lines.push('', '## Fallback Chains', '');
    for (const chain of chains) {
        lines.push(`- ${chain.chain} | ${chain.targets.join(' -> ') || '(none)'}`);
    }
    lines.push('', `<!-- generated_at=${now.toISOString()} -->`);
    return lines.join('\n');
}
function renderUserFailureModes(providers, now) {
    const families = dedupe(providers.map((provider) => provider.provider));
    const lines = ['## Known Failure Modes', '| Symptom | Cause | Fix |', '|---------|-------|-----|'];
    lines.push('| Stale context guidance | Factory generator has not run recently | Run standard factory task and commit updated docs |');
    lines.push('| Wrong model selected | `provider-registry.ts` changed without context refresh | Re-run factory task after routing changes |');
    lines.push(`| Provider auth failures | Credentials missing for one of ${families.join(', ') || 'configured providers'} | Update secrets and re-run health checks |`);
    lines.push('| Trigger run completed with no docs changed | Inputs unchanged or run in non-git snapshot | Inspect summary output and source files |');
    lines.push('', `<!-- generated_at=${now.toISOString()} -->`);
    return lines.join('\n');
}
export function runContextFactory(options = {}) {
    const rootDir = options.rootDir ?? process.cwd();
    const commitLimit = options.commitLimit ?? DEFAULT_COMMIT_LIMIT;
    const now = options.now ?? new Date();
    const decisions = parseDecisions(readUtf8(rootDir, 'docs/DECISIONS.md'));
    const commits = getRecentCommits(rootDir, commitLimit);
    const providerSource = readUtf8(rootDir, 'src/provider-registry.ts');
    const providers = parseProviderDefaults(providerSource);
    const chains = parseFallbackChains(providerSource);
    const writes = [
        ['src/anchor-files/recent-decisions.md', renderAnchorRecentDecisions(decisions, commits)],
        ['src/anchor-files/active-projects.md', renderAnchorActiveProjects(providers, chains)],
        ['src/anchor-files/failure-modes.md', renderAnchorFailureModes(providers, commits)],
        ['memory/user_context/recent-decisions.md', renderUserRecentDecisions(decisions, commits, now)],
        ['memory/user_context/active-projects.md', renderUserActiveProjects(providers, chains, now)],
        ['memory/user_context/failure-modes.md', renderUserFailureModes(providers, now)],
    ];
    const updatedFiles = writes
        .filter(([relativePath, content]) => writeIfChanged(rootDir, relativePath, content))
        .map(([relativePath]) => relativePath);
    return {
        decisions: decisions.length,
        commits: commits.length,
        providers: providers.length,
        updatedFiles,
    };
}
//# sourceMappingURL=context-factory.js.map