/**
 * NanoClaw OpenAI-Compatible Agent Runner (shared base)
 * Contains all shared logic for runners that use an OpenAI-compatible API.
 * Parameterized via RunnerConfig to support Qwen, OpenRouter, and others.
 */
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { runValidatedBashCommand } from './bash-executor.js';
import { wrapExternalContent } from './external-content.js';
import { evaluateToolPolicy, filterToolsForPolicy, normalizeToolPolicyMode } from './sandbox-tool-policy.js';
import { buildToolResultContextMessage } from './tool-result-context-guard.js';
// ─── Constants ────────────────────────────────────────────────────────────────
// Must match container-runner.ts sentinel values
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';
const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_MESSAGES_DIR = '/workspace/ipc/messages';
const IPC_TASKS_DIR = '/workspace/ipc/tasks';
const IPC_POLL_MS = 500;
const MAX_HISTORY_MESSAGES = 50;
const BASH_TIMEOUT_MS = 30_000;
const MAX_TOOL_ITERATIONS = 20;
const MAX_SWARM_DEPTH = 3;
const USAGE_WARNING_THRESHOLD = 250_000;
const URL_PREFETCH_CHAR_LIMIT = 50_000;
const MAX_PREFETCH_URLS = 3;
const sessionPromptCache = new Map();
// ─── Logging / output ─────────────────────────────────────────────────────────
function makeLog(name) {
    return (msg) => {
        console.error(`[${name}-runner] ${msg}`);
    };
}
function writeOutput(output) {
    console.log(OUTPUT_START_MARKER);
    console.log(JSON.stringify(output));
    console.log(OUTPUT_END_MARKER);
}
// ─── Stdin ────────────────────────────────────────────────────────────────────
async function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { data += chunk; });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}
// ─── Context tier ────────────────────────────────────────────────────────────
/**
 * Classify a provider string into a context budget tier.
 * - 'full'  : Claude, GPT-4o — inject STATE + RECENT + core
 * - 'medium': 70B models, DeepSeek — inject STATE + RECENT
 * - 'lean'  : small/free models — inject STATE only
 */
function getContextTier(provider) {
    if (!provider)
        return 'lean';
    if (provider.startsWith('claude') || provider.includes('gpt-4o'))
        return 'full';
    if (provider.includes('deepseek') || provider.includes('70b') || provider.includes('llama-3'))
        return 'medium';
    return 'lean';
}
// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(containerInput, providerHint) {
    const parts = [];
    const tier = getContextTier(providerHint);
    // Load global skills (synced to each group)
    const skillsDir = '/home/node/.claude/skills';
    if (fs.existsSync(skillsDir)) {
        const skillContainers = fs.readdirSync(skillsDir);
        for (const skillSlug of skillContainers) {
            const skillFile = path.join(skillsDir, skillSlug, 'SKILL.md');
            if (fs.existsSync(skillFile)) {
                parts.push(`Skill [${skillSlug}]:\n${fs.readFileSync(skillFile, 'utf-8')}`);
            }
        }
    }
    // Runtime context (current model, chain, features)
    const runtimeContextFile = '/workspace/ipc/runtime-context.md';
    if (fs.existsSync(runtimeContextFile)) {
        parts.push(fs.readFileSync(runtimeContextFile, 'utf-8'));
    }
    // Load group-specific CLAUDE.md (works for all runners — injected as labeled context)
    const groupClaudeMd = '/workspace/group/CLAUDE.md';
    if (fs.existsSync(groupClaudeMd)) {
        parts.push(`Group Memory (CLAUDE.md):\n${fs.readFileSync(groupClaudeMd, 'utf-8')}`);
    }
    // Load global CLAUDE.md for non-main groups
    if (!containerInput.isMain) {
        const globalClaudeMd = '/workspace/global/CLAUDE.md';
        if (fs.existsSync(globalClaudeMd)) {
            parts.push(`Global Memory (CLAUDE.md):\n${fs.readFileSync(globalClaudeMd, 'utf-8')}`);
        }
    }
    // ── Tiered cross-model memory injection ──────────────────────────────────────
    // STATE.md: current session handoff — all models, always
    const stateMd = '/workspace/group/memory/session/STATE.md';
    if (fs.existsSync(stateMd)) {
        parts.push(`## Current Session State (read first)\n${fs.readFileSync(stateMd, 'utf-8')}`);
    }
    // RECENT.md: rolling log of last N sessions — medium+ models only
    if (tier === 'full' || tier === 'medium') {
        const recentMd = '/workspace/group/memory/session/RECENT.md';
        if (fs.existsSync(recentMd)) {
            parts.push(`## Session History (recent context)\n${fs.readFileSync(recentMd, 'utf-8')}`);
        }
    }
    const base = [
        'You are a helpful AI assistant running inside a container.',
        'You have access to tools to help you complete tasks.',
        'Use tools when needed. When done, give a clear, concise response.',
        containerInput.isMain
            ? 'Codebase root is /workspace/project. Use this for source code edits.'
            : 'This container does not have project-root access. Use /workspace/group and mounted memory artifacts only.',
        'Use /workspace/group only for group docs/memory artifacts.',
        'If the user asks you to create/update a file, you MUST call write_file (or edit_file) and then read_file to verify it exists before claiming success.',
        'Never claim a file was written unless a tool call succeeded.',
        '',
        'Context:',
        `- Group folder: ${containerInput.groupFolder}`,
        `- Chat JID: ${containerInput.chatJid}`,
        `- Is main group: ${containerInput.isMain}`,
        `- Working directory: ${containerInput.isMain ? '/workspace/project' : '/workspace/group'}`,
    ].join('\n');
    return parts.length > 0
        ? base + '\n\n---\n\n' + parts.join('\n\n---\n\n')
        : base;
}
function extractUrls(text) {
    const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
    const unique = [];
    for (const raw of matches) {
        if (!unique.includes(raw))
            unique.push(raw);
        if (unique.length >= MAX_PREFETCH_URLS)
            break;
    }
    return unique;
}
function fetchUrlText(url, source = 'web.fetch') {
    try {
        // Use execFileSync to avoid shell interpolation risks.
        const out = execFileSync('curl', ['-sL', url], {
            encoding: 'utf-8',
            timeout: 15_000,
            maxBuffer: 8 * 1024 * 1024,
        });
        return wrapExternalContent({
            source,
            url,
            content: out,
            maxChars: URL_PREFETCH_CHAR_LIMIT,
        });
    }
    catch (err) {
        return wrapExternalContent({
            source: `${source}_error`,
            url,
            content: `Failed to browse ${url}: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
}
function augmentPromptWithPrefetchedUrls(prompt) {
    const urls = extractUrls(prompt);
    if (urls.length === 0)
        return prompt;
    const chunks = urls.map((url) => fetchUrlText(url, 'auto_prefetched_url'));
    return [
        prompt,
        '',
        '---',
        '',
        'Auto-fetched URL context (must use these sources for your answer):',
        '',
        ...chunks,
        '',
        'Requirement: If a source fetch failed, explicitly say so and do not fabricate details.',
    ].join('\n');
}
function isPathWithin(base, target) {
    const rel = path.relative(path.resolve(base), path.resolve(target));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
function mapPathForGroup(rawPath, groupFolder, allowProjectRoot) {
    const trimmed = rawPath.trim();
    if (!trimmed)
        return trimmed;
    if (!path.isAbsolute(trimmed)) {
        return path.resolve(allowProjectRoot ? '/workspace/project' : '/workspace/group', trimmed);
    }
    if (trimmed.startsWith('/workspace/group/'))
        return path.normalize(trimmed);
    if (trimmed.startsWith('/workspace/project/'))
        return path.normalize(trimmed);
    if (trimmed === '/workspace/group' || trimmed === '/workspace/project' || trimmed === '/workspace/ipc') {
        return path.normalize(trimmed);
    }
    const marker = `/groups/${groupFolder}/`;
    const idx = trimmed.indexOf(marker);
    if (idx >= 0) {
        const suffix = trimmed.slice(idx + marker.length);
        return path.resolve('/workspace/group', suffix);
    }
    return path.normalize(trimmed);
}
function resolveReadPath(rawPath, groupFolder, allowProjectRoot) {
    const resolved = mapPathForGroup(rawPath, groupFolder, allowProjectRoot);
    const allowedRoots = allowProjectRoot
        ? ['/workspace/group', '/workspace/project', '/workspace/ipc']
        : ['/workspace/group', '/workspace/ipc'];
    if (allowedRoots.some((root) => isPathWithin(root, resolved))) {
        return { ok: true, path: resolved };
    }
    return {
        ok: false,
        error: allowProjectRoot
            ? `Refused read path: ${rawPath}. Use /workspace/project/... (codebase), /workspace/group/... (group files), or a relative path.`
            : `Refused read path: ${rawPath}. Use /workspace/group/... (group files) or a relative path.`,
    };
}
function resolveWritePath(rawPath, groupFolder, allowProjectRoot) {
    const resolved = mapPathForGroup(rawPath, groupFolder, allowProjectRoot);
    if (isPathWithin('/workspace/group', resolved) || (allowProjectRoot && isPathWithin('/workspace/project', resolved))) {
        return { ok: true, path: resolved };
    }
    return {
        ok: false,
        error: allowProjectRoot
            ? `Refused write path: ${rawPath}. Use /workspace/project/... (codebase), /workspace/group/... (group files), or a relative path.`
            : `Refused write path: ${rawPath}. Use /workspace/group/... (group files) or a relative path.`,
    };
}
/**
* Linter gate — run syntax check on a file after write/edit.
* Returns null on pass, error string on fail.
* SWE-Agent pattern: reject invalid edits, force model to retry.
*/
function lintFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const lintCwd = filePath.startsWith('/workspace/group/') ? '/workspace/group' : '/workspace/project';
    try {
        switch (ext) {
            case '.ts':
            case '.tsx':
                execSync(`npx tsc --noEmit --allowJs --skipLibCheck ${filePath} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 15_000,
                    cwd: lintCwd,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                return null;
            case '.js':
            case '.mjs':
                execSync(`node --check ${filePath}`, {
                    encoding: 'utf-8',
                    timeout: 5_000,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                return null;
            case '.json':
                JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                return null;
            case '.py':
                execSync(`python3 -m py_compile ${filePath}`, {
                    encoding: 'utf-8',
                    timeout: 5_000,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                return null;
            default:
                return null; // no linter for this type
        }
    }
    catch (err) {
        const e = err;
        return ((e.stdout ?? '') + (e.stderr ?? '')).trim() || e.message || 'Syntax check failed';
    }
}
// ─── History ──────────────────────────────────────────────────────────────────
function getHistoryPath(historyDir, sessionId) {
    const filename = sessionId ? `history-${sessionId}.json` : 'history.json';
    return `/workspace/group/${historyDir}/${filename}`;
}
function getSessionPromptPath(historyDir, sessionId) {
    return `/workspace/group/${historyDir}/system-prompt-${sessionId}.txt`;
}
function getCachedSessionPrompt(historyDir, sessionId) {
    const cached = sessionPromptCache.get(sessionId);
    if (cached)
        return cached;
    try {
        const promptPath = getSessionPromptPath(historyDir, sessionId);
        if (!fs.existsSync(promptPath))
            return undefined;
        const prompt = fs.readFileSync(promptPath, 'utf-8');
        sessionPromptCache.set(sessionId, prompt);
        return prompt;
    }
    catch {
        return undefined;
    }
}
function setCachedSessionPrompt(historyDir, sessionId, systemPrompt) {
    sessionPromptCache.set(sessionId, systemPrompt);
    try {
        const promptPath = getSessionPromptPath(historyDir, sessionId);
        fs.mkdirSync(path.dirname(promptPath), { recursive: true });
        fs.writeFileSync(promptPath, systemPrompt, 'utf-8');
    }
    catch {
        // Non-fatal: keep the in-memory cache even if disk persistence fails.
    }
}
function assistantMessageHasToolCalls(message) {
    return message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}
function cleanHistory(messages, limit) {
    const nonSystem = messages.filter((m) => m.role !== 'system');
    let startIdx = Math.max(0, nonSystem.length - limit);
    // Move startIdx forward to ensure we don't start in the middle of a tool-call sequence
    while (startIdx < nonSystem.length) {
        const m = nonSystem[startIdx];
        if (m.role === 'user')
            break;
        if (m.role === 'assistant' && !assistantMessageHasToolCalls(m))
            break;
        startIdx++;
    }
    return nonSystem.slice(startIdx);
}
function loadHistory(historyDir, log, sessionId, isScheduledTask) {
    // If it's a scheduled/delegated task and no explicit session ID is given,
    // we want total isolation. Do NOT load the main history.
    if (isScheduledTask && !sessionId) {
        return [];
    }
    try {
        const p = getHistoryPath(historyDir, sessionId);
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (Array.isArray(data.messages)) {
                return cleanHistory(data.messages, MAX_HISTORY_MESSAGES);
            }
        }
    }
    catch (err) {
        log(`Failed to load history: ${err instanceof Error ? err.message : String(err)}`);
    }
    return [];
}
function saveHistory(historyDir, messages, log, sessionId, isScheduledTask) {
    // If it's a scheduled/delegated task and no explicit session ID is given,
    // we do NOT want to save history as it would overwrite the main history.json.
    if (isScheduledTask && !sessionId) {
        return;
    }
    try {
        const p = getHistoryPath(historyDir, sessionId);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const clean = cleanHistory(messages, MAX_HISTORY_MESSAGES);
        const system = messages.filter((m) => m.role === 'system');
        const data = {
            messages: [...system, ...clean],
            lastUpdated: new Date().toISOString(),
        };
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
    }
    catch (err) {
        log(`Failed to save history: ${err instanceof Error ? err.message : String(err)}`);
    }
}
// ─── Tool definitions ─────────────────────────────────────────────────────────
/**
* Full tool definitions — fetched on demand via get_tool_definition.
* NOT sent to the model upfront. Cursor pattern: 46.9% token reduction.
*/
const TOOL_DEFINITIONS = {
    bash: {
        type: 'function',
        function: {
            name: 'bash',
            description: 'Execute a bash command in the mounted working directory. Timeout: 30s.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The bash command to run' },
                },
                required: ['command'],
            },
        },
    },
    read_file: {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read a file and return its contents.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the file' },
                },
                required: ['path'],
            },
        },
    },
    write_file: {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Write content to a file (creates parent directories as needed).',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to write' },
                    content: { type: 'string', description: 'File content' },
                },
                required: ['path', 'content'],
            },
        },
    },
    edit_file: {
        type: 'function',
        function: {
            name: 'edit_file',
            description: 'Replace the first occurrence of old_string with new_string in a file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Absolute path to the file' },
                    old_string: { type: 'string', description: 'Exact string to find' },
                    new_string: { type: 'string', description: 'Replacement string' },
                },
                required: ['path', 'old_string', 'new_string'],
            },
        },
    },
    glob: {
        type: 'function',
        function: {
            name: 'glob',
            description: 'Find files by name pattern (e.g., "*.ts", "**/*.json").',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Glob pattern' },
                    cwd: { type: 'string', description: 'Search root (default: mounted working directory)' },
                },
                required: ['pattern'],
            },
        },
    },
    send_message: {
        type: 'function',
        function: {
            name: 'send_message',
            description: 'Send a message to the user immediately (for progress updates).',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Message text to send' },
                },
                required: ['text'],
            },
        },
    },
    browse_url: {
        type: 'function',
        function: {
            name: 'browse_url',
            description: 'Navigate to a URL and extract its text content and meta info.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to visit' },
                },
                required: ['url'],
            },
        },
    },
    schedule_task: {
        type: 'function',
        function: {
            name: 'schedule_task',
            description: 'Schedule a recurring or one-off task.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'The prompt to run' },
                    schedule_type: { type: 'string', enum: ['cron', 'interval', 'once'] },
                    schedule_value: { type: 'string', description: 'Cron exp, MS interval, or ISO timestamp' },
                    targetJid: { type: 'string', description: 'Telegram chat JID (default: current)' },
                    context_mode: { type: 'string', enum: ['group', 'isolated'], default: 'isolated' },
                },
                required: ['prompt', 'schedule_type', 'schedule_value'],
            },
        },
    },
    spawn_subagent: {
        type: 'function',
        function: {
            name: 'spawn_subagent',
            description: 'Spawn a sub-agent to perform a sub-task. Synchronous - parent waits for the result.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Task for the sub-agent' },
                },
                required: ['prompt'],
            },
        },
    },
    read_skill_manual: {
        type: 'function',
        function: {
            name: 'read_skill_manual',
            description: 'Read the full manual/documentation for a specific skill.',
            parameters: {
                type: 'object',
                properties: {
                    skill_name: { type: 'string', description: 'Name of the skill directory' },
                },
                required: ['skill_name'],
            },
        },
    },
};
/**
* Stub list — sent to the model on every call instead of full definitions.
* One-liner descriptions only. Model calls get_tool_definition when it needs
* the full schema for a tool it wants to use.
*/
function getAvailableToolDefinitions(mode) {
    const allowedNames = new Set(filterToolsForPolicy(Object.keys(TOOL_DEFINITIONS), mode));
    return Object.fromEntries(Object.entries(TOOL_DEFINITIONS).filter(([toolName]) => allowedNames.has(toolName)));
}
function buildToolStubs(mode) {
    const availableDefinitions = getAvailableToolDefinitions(mode);
    return [
        {
            type: 'function',
            function: {
                name: 'get_tool_definition',
                description: 'Get the full parameter schema for a tool before using it. Call this first if unsure how to call a tool.',
                parameters: {
                    type: 'object',
                    properties: {
                        tool_name: { type: 'string', description: `One of: ${Object.keys(availableDefinitions).join(', ')}` },
                    },
                    required: ['tool_name'],
                },
            },
        },
        ...Object.values(availableDefinitions).map((toolDefinition) => ({
            type: 'function',
            function: {
                name: toolDefinition.function.name,
                description: toolDefinition.function.description,
            },
        })),
    ];
}
// ─── Tool execution ───────────────────────────────────────────────────────────
async function executeTool(name, args, containerInput, secretKeys, client, usage, depth, modelEnvVar, model, systemPrompt) {
    try {
        const policyDecision = evaluateToolPolicy(name, containerInput.toolPolicyMode);
        if (!policyDecision.allowed) {
            return policyDecision.reason ?? `Tool ${name} is not available.`;
        }
        switch (name) {
            case 'bash': {
                const command = String(args.command ?? '');
                const env = { ...process.env };
                for (const key of secretKeys)
                    delete env[key];
                const cwd = containerInput.isMain ? '/workspace/project' : '/workspace/group';
                return runValidatedBashCommand(command, env, cwd);
            }
            case 'read_file': {
                const requested = String(args.path ?? '');
                const resolved = resolveReadPath(requested, containerInput.groupFolder, containerInput.isMain);
                if (!resolved.ok)
                    return resolved.error;
                const filePath = resolved.path;
                if (!fs.existsSync(filePath))
                    return `File not found: ${filePath}`;
                return fs.readFileSync(filePath, 'utf-8');
            }
            case 'write_file': {
                const requested = String(args.path ?? '');
                const resolved = resolveWritePath(requested, containerInput.groupFolder, containerInput.isMain);
                if (!resolved.ok)
                    return resolved.error;
                const filePath = resolved.path;
                const content = String(args.content ?? '');
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, content);
                // Linter gate — reject syntactically invalid files, force model to retry
                const lintError = lintFile(filePath);
                if (lintError) {
                    fs.unlinkSync(filePath); // remove the bad file
                    return `LINT_FAILED: Syntax error in ${filePath} — file rejected, please fix and retry:\n${lintError}`;
                }
                return `Wrote ${content.length} bytes to ${filePath}`;
            }
            case 'edit_file': {
                const requested = String(args.path ?? '');
                const resolved = resolveWritePath(requested, containerInput.groupFolder, containerInput.isMain);
                if (!resolved.ok)
                    return resolved.error;
                const filePath = resolved.path;
                const oldStr = String(args.old_string ?? '');
                const newStr = String(args.new_string ?? '');
                if (!fs.existsSync(filePath))
                    return `File not found: ${filePath}`;
                const current = fs.readFileSync(filePath, 'utf-8');
                if (!current.includes(oldStr)) {
                    return `String not found in file: ${oldStr.slice(0, 100)}`;
                }
                const updated = current.replace(oldStr, newStr);
                fs.writeFileSync(filePath, updated);
                // Linter gate — reject syntactically invalid edits, restore original, force retry
                const lintError = lintFile(filePath);
                if (lintError) {
                    fs.writeFileSync(filePath, current); // restore original
                    return `LINT_FAILED: Syntax error introduced by edit to ${filePath} — edit rejected, original restored, please fix and retry:\n${lintError}`;
                }
                return 'File edited successfully';
            }
            case 'glob': {
                const pattern = String(args.pattern ?? '*');
                const cwd = String(args.cwd ?? (containerInput.isMain ? '/workspace/project' : '/workspace/group'));
                const namePattern = pattern.split('/').pop() ?? '*';
                const dirParts = pattern.split('/').slice(0, -1).filter((p) => !p.includes('*'));
                const searchDir = dirParts.length > 0 ? path.join(cwd, ...dirParts) : cwd;
                try {
                    const out = execSync(`find "${searchDir}" -name "${namePattern}" -type f 2>/dev/null | head -100`, { encoding: 'utf-8', timeout: 10_000 });
                    return out.trim() || 'No files found';
                }
                catch {
                    return 'No files found';
                }
            }
            case 'send_message': {
                const text = String(args.text ?? '');
                fs.mkdirSync(IPC_MESSAGES_DIR, { recursive: true });
                const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
                const data = {
                    type: 'message',
                    chatJid: containerInput.chatJid,
                    text,
                    groupFolder: containerInput.groupFolder,
                    timestamp: new Date().toISOString(),
                };
                fs.writeFileSync(path.join(IPC_MESSAGES_DIR, filename), JSON.stringify(data, null, 2));
                return 'Message sent';
            }
            case 'browse_url': {
                const url = String(args.url ?? '');
                return fetchUrlText(url, 'browse_url');
            }
            case 'schedule_task': {
                fs.mkdirSync(IPC_TASKS_DIR, { recursive: true });
                const filename = `task-${Date.now()}.json`;
                const data = {
                    type: 'schedule_task',
                    prompt: args.prompt,
                    schedule_type: args.schedule_type,
                    schedule_value: args.schedule_value,
                    targetJid: args.targetJid || containerInput.chatJid,
                    context_mode: args.context_mode || 'isolated',
                };
                fs.writeFileSync(path.join(IPC_TASKS_DIR, filename), JSON.stringify(data, null, 2));
                return 'Task scheduled';
            }
            case 'spawn_subagent': {
                if (depth >= MAX_SWARM_DEPTH)
                    return 'Error: Max swarm depth reached.';
                const subPrompt = String(args.prompt ?? '');
                const { result } = await runQuery(client, process.env[modelEnvVar] || model, systemPrompt, [], subPrompt, containerInput, secretKeys, () => { }, usage, depth + 1, modelEnvVar);
                return `Sub-agent Response:\n---\n${result}\n---`;
            }
            case 'read_skill_manual': {
                const skillName = String(args.skill_name ?? '');
                const p = `/home/node/.claude/skills/${skillName}/SKILL.md`;
                if (fs.existsSync(p))
                    return fs.readFileSync(p, 'utf-8');
                return `Skill manual not found: ${skillName}`;
            }
            case 'get_tool_definition': {
                const toolName = String(args.tool_name ?? '');
                const definitionPolicy = evaluateToolPolicy(toolName, containerInput.toolPolicyMode);
                if (!definitionPolicy.allowed) {
                    return definitionPolicy.reason ?? `Tool ${toolName} is not available.`;
                }
                const availableDefinitions = getAvailableToolDefinitions(containerInput.toolPolicyMode);
                const def = availableDefinitions[toolName];
                if (!def)
                    return `Unknown tool: ${toolName}. Available: ${Object.keys(availableDefinitions).join(', ')}`;
                return JSON.stringify(def.function.parameters, null, 2);
            }
            default:
                return `Unknown tool: ${name}`;
        }
    }
    catch (err) {
        return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
    }
}
// ─── IPC helpers ──────────────────────────────────────────────────────────────
function shouldClose() {
    if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
        try {
            fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
        }
        catch { /* ignore */ }
        return true;
    }
    return false;
}
function drainIpcInput() {
    try {
        fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
        const files = fs.readdirSync(IPC_INPUT_DIR)
            .filter((f) => f.endsWith('.json'))
            .sort();
        const messages = [];
        for (const file of files) {
            const filePath = path.join(IPC_INPUT_DIR, file);
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                fs.unlinkSync(filePath);
                if (data.type === 'message' && data.text)
                    messages.push(data.text);
            }
            catch { /* skip corrupt files */ }
        }
        return messages;
    }
    catch {
        return [];
    }
}
function waitForIpcMessage() {
    return new Promise((resolve) => {
        const poll = () => {
            if (shouldClose()) {
                resolve(null);
                return;
            }
            const msgs = drainIpcInput();
            if (msgs.length > 0) {
                resolve(msgs.join('\n'));
                return;
            }
            setTimeout(poll, IPC_POLL_MS);
        };
        poll();
    });
}
// ─── Query loop ───────────────────────────────────────────────────────────────
async function runQuery(client, model, systemPrompt, history, userPrompt, containerInput, secretKeys, log, usage, depth, modelEnvVar) {
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userPrompt },
    ];
    const toolStubs = buildToolStubs(containerInput.toolPolicyMode);
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        log(`Iteration ${i + 1}/${MAX_TOOL_ITERATIONS} (model: ${model})...`);
        const response = await client.chat.completions.create({
            model,
            messages,
            tools: toolStubs,
            tool_choice: 'auto',
        });
        // Update usage tracking
        if (response.usage) {
            usage.totalTokens += response.usage.total_tokens || 0;
            usage.promptTokens += response.usage.prompt_tokens || 0;
            usage.completionTokens += response.usage.completion_tokens || 0;
            if (usage.totalTokens > USAGE_WARNING_THRESHOLD && !usage.warningSent) {
                usage.warningSent = true;
                // Native tool call for message
                executeTool('send_message', { text: `⚠️ WARNING: Cumulative token usage in this session has exceeded ${USAGE_WARNING_THRESHOLD.toLocaleString()}. Currently at ${usage.totalTokens.toLocaleString()}.` }, containerInput, secretKeys, client, usage, depth, modelEnvVar, model, systemPrompt);
            }
        }
        const choice = response.choices[0];
        if (!choice)
            throw new Error('No response from API');
        const msg = choice.message;
        messages.push(msg);
        if (!msg.tool_calls || msg.tool_calls.length === 0 || choice.finish_reason === 'stop') {
            const result = msg.content ?? '';
            log(`Final answer at iteration ${i + 1}: ${result.slice(0, 100)}`);
            return {
                result,
                updatedHistory: messages.filter((m) => m.role !== 'system'),
            };
        }
        for (const toolCall of msg.tool_calls) {
            let toolArgs = {};
            try {
                toolArgs = JSON.parse(toolCall.function.arguments);
            }
            catch { /* use empty args */ }
            log(`Tool: ${toolCall.function.name}(${JSON.stringify(toolArgs).slice(0, 80)})`);
            const result = await executeTool(toolCall.function.name, toolArgs, containerInput, secretKeys, client, usage, depth, modelEnvVar, model, systemPrompt);
            log(`  → ${result.slice(0, 100)}`);
            messages.push(buildToolResultContextMessage(toolCall.id, toolCall.function.name, result));
        }
    }
    return {
        result: 'Task completed (reached tool call limit).',
        updatedHistory: messages.filter((m) => m.role !== 'system'),
    };
}
// ─── Main exported entry point ────────────────────────────────────────────────
export async function runOpenAICompatAgent(config) {
    const log = makeLog(config.name);
    let containerInput;
    try {
        const stdinData = await readStdin();
        containerInput = JSON.parse(stdinData);
        try {
            fs.unlinkSync('/tmp/input.json');
        }
        catch { /* ignore */ }
        log(`Tool policy mode: ${normalizeToolPolicyMode(containerInput.toolPolicyMode)}`);
    }
    catch (err) {
        writeOutput({ status: 'error', result: null, error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}` });
        process.exit(1);
        return;
    }
    const secrets = containerInput.secrets ?? {};
    const apiKey = secrets[config.apiKeySecret] ?? '';
    const baseURL = typeof config.baseURL === 'function' ? config.baseURL(secrets) : config.baseURL;
    const model = process.env[config.modelEnvVar] ?? config.defaultModel;
    if (!apiKey) {
        writeOutput({ status: 'error', result: null, error: `${config.apiKeySecret} not configured.` });
        process.exit(1);
    }
    const client = new OpenAI({ apiKey, baseURL });
    const secretKeys = Object.keys(secrets);
    const usage = { totalTokens: 0, promptTokens: 0, completionTokens: 0, warningSent: false };
    try {
        fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
    }
    catch { /* ignore */ }
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const cachedPrompt = containerInput.sessionId
        ? getCachedSessionPrompt(config.historyDir, containerInput.sessionId)
        : undefined;
    const systemPrompt = cachedPrompt ?? buildSystemPrompt(containerInput, model);
    if (containerInput.sessionId && !cachedPrompt) {
        setCachedSessionPrompt(config.historyDir, containerInput.sessionId, systemPrompt);
    }
    let history = loadHistory(config.historyDir, log, containerInput.sessionId, containerInput.isScheduledTask);
    let prompt = augmentPromptWithPrefetchedUrls(containerInput.prompt);
    if (containerInput.isScheduledTask) {
        prompt = `[SCHEDULED TASK]\n\n${prompt}`;
    }
    const pending = drainIpcInput();
    if (pending.length > 0)
        prompt += '\n' + pending.join('\n');
    try {
        const isWarmStandby = containerInput.warmStandby === true;
        let hasPrompt = !isWarmStandby;
        while (true) {
            if (hasPrompt) {
                log(`Starting query (history: ${history.length}, total_tokens: ${usage.totalTokens})...`);
                const { result, updatedHistory } = await runQuery(client, model, systemPrompt, history, prompt, containerInput, secretKeys, log, usage, 0, config.modelEnvVar);
                history = updatedHistory;
                saveHistory(config.historyDir, history, log, containerInput.sessionId, containerInput.isScheduledTask);
                writeOutput({ status: 'success', result, newSessionId: containerInput.sessionId });
                // Subagents (delegated tasks) should do exactly one iteration and exit,
                // instead of blocking indefinitely waiting for human IPC follow-up.
                if (containerInput.isScheduledTask)
                    break;
            }
            if (shouldClose())
                break;
            const nextMessage = await waitForIpcMessage();
            if (nextMessage === null)
                break;
            prompt = nextMessage;
            hasPrompt = true;
        }
    }
    catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        log(`Agent error: ${errorText}`);
        writeOutput({ status: 'error', result: null, error: errorText });
        process.exit(1);
    }
}
