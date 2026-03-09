// Lightweight NanoClaw Configuration
import path from 'path';
import { readEnvFile } from './env.js';
const envConfig = readEnvFile([
    'ASSISTANT_NAME',
    'TELEGRAM_BOT_TOKEN',
    'DISCORD_BOT_TOKEN',
    'DISCORD_TOKEN',
    'CLAUDE_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'OPENROUTER_API_KEY',
    'DASHSCOPE_API_KEY',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DASHSCOPE_BASE_URL',
    'DASHSCOPE_STD_MODEL',
    'STD_BRAIN_MODEL',
    'BRAVE_API_KEY',
    'PERPLEXITY_API_KEY',
    'AGENT_DEFAULT_MODE',
    'COMPACTION_TRIGGER_PCT',
    'REBASE_TARGET_PCT',
    'CONTEXT_HARD_STOP_PCT',
    'PRO_SHARD_STRATEGY',
    'PRO_MAX_SHARDS_PER_TASK',
    'PRO_MAX_CALLS_PER_TASK',
    'PRO_MIN_SHARD_SIZE',
    'GLOBAL_DAILY_BUDGET_USD',
    'GLOBAL_MONTHLY_BUDGET_USD',
    'MODE_BUDGET_ECO_DAILY_USD',
    'MODE_BUDGET_STANDARD_DAILY_USD',
    'MODE_BUDGET_PRO_DAILY_USD',
    'DEFAULT_TASK_BUDGET_USD',
    'DEFAULT_SHARD_BUDGET_USD',
    'DEFAULT_ESCALATION_BUDGET_USD',
    'MAX_RECURSIVE_SHARD_SPLITS',
    'COPAW_ENABLED',
    'COPAW_ROUTE_COMPLEX_PCT',
    'COPAW_TIMEOUT_MS',
    'COPAW_MAX_INFLIGHT',
    'COPAW_FAILURE_CIRCUIT_THRESHOLD',
    'COPAW_BASE_URL',
    'COPAW_UPSTREAM_PIN',
    'KEET_DEPLOYMENT_PROFILE',
    'KEET_REQUIRE_CONTAINER_RUNTIME',
    'KEET_REQUIRE_AGENT_IMAGE',
    'KEET_REQUIRE_CLASSIFIER_SIDECAR',
    'KEET_REQUIRE_COPAW_SIDECAR',
    'KEET_CONTAINER_RUNTIME_BIN',
    'KEET_COPAW_MIGRATION_PHASE',
    'KEET_COPAW_ALLOW_LEGACY_READS',
    'KEET_COPAW_WARN_ON_LEGACY_READS',
    'KEET_CONTROL_STUB_DEPRECATED_ENDPOINTS',
    'KEET_MIGRATION_GATE_MAX_LEGACY_READS',
    'KEET_MCP_API_STEPS_ENABLED',
    'KEET_MCP_CONFIG_PATH',
    'KEET_INTERACTION_LOGGING',
]);
export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
// IPC lives at ./ipc/ (not ./data/ipc/) — separate from DATA_DIR
export const IPC_DIR = path.resolve(PROJECT_ROOT, 'ipc');
export const MAIN_GROUP_FOLDER = 'main';
export const CONTAINER_IMAGE = process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(process.env.CONTAINER_TIMEOUT || '1800000', // 30 minutes
10);
export const MAX_TASK_CALLS = parseInt(process.env.MAX_TASK_CALLS ?? '40', 10);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(process.env.CONTAINER_MAX_OUTPUT_SIZE || '8000', // 8K chars — step outputs feed LLM context
10);
export const CONTAINER_HARD_KILL_MS = CONTAINER_TIMEOUT * 2; // 60 min — force-kill ceiling
export const CONTAINER_PREWARM_ENABLED = false; // Disabled for lightweight
export const CONTAINER_PREWARM_COUNT = 0; // No prewarming
export const CONTAINER_STANDBY_ENABLED = false; // Disabled for lightweight
export const CONTAINER_STANDBY_COUNT = 0; // No standby containers
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', // 30 minutes
10);
export const MAX_CONCURRENT_CONTAINERS = 2; // Reduced for lightweight
export const QUEUE_DEPTH_ALERT_THRESHOLD = parseInt(process.env.QUEUE_DEPTH_ALERT_THRESHOLD || '10', 10);
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export const TRIGGER_PATTERN = new RegExp(`^@${escapeRegex(ASSISTANT_NAME)}\\b`, 'i');
export const TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || envConfig.TELEGRAM_BOT_TOKEN || '';
// Discord configuration
const DISCORD_TOKEN_LEGACY = process.env.DISCORD_TOKEN || envConfig.DISCORD_TOKEN || '';
export const DISCORD_TOKEN_ALIAS_USED = !process.env.DISCORD_BOT_TOKEN && !envConfig.DISCORD_BOT_TOKEN && Boolean(DISCORD_TOKEN_LEGACY);
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || envConfig.DISCORD_BOT_TOKEN || DISCORD_TOKEN_LEGACY || '';
// Set DISCORD_ONLY=true to disable Telegram and run Discord as the sole channel
export const DISCORD_ONLY = (process.env.DISCORD_ONLY || '').toLowerCase() === 'true';
// Agent mode: eco | standard | pro | auto (default: auto)
export const AGENT_DEFAULT_MODE = (process.env.AGENT_DEFAULT_MODE || envConfig.AGENT_DEFAULT_MODE || 'auto');
// Web search API keys (optional — fall back gracefully if not set)
export const BRAVE_API_KEY = process.env.BRAVE_API_KEY || envConfig.BRAVE_API_KEY || '';
export const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || envConfig.PERPLEXITY_API_KEY || '';
// Lightweight Model Configuration
export const PRIMARY_PROVIDER = 'dashscope';
// Cloud-only fallback chain for this phase: DashScope + DeepSeek.
export const FALLBACK_CHAIN = [
    'dashscope:qwen3.5-plus',
    'deepseek:deepseek-reasoner',
];
// Required API Keys
export const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || envConfig.CLAUDE_API_KEY || '';
export const CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN || envConfig.CLAUDE_CODE_OAUTH_TOKEN || '';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || envConfig.OPENROUTER_API_KEY || '';
// DashScope international endpoint — OpenAI-compatible, lower cost on Qwen models
export const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || envConfig.DASHSCOPE_API_KEY || '';
export const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || envConfig.DASHSCOPE_BASE_URL || 'https://coding-intl.dashscope.aliyuncs.com/v1';
export const DASHSCOPE_STD_MODEL = process.env.DASHSCOPE_STD_MODEL || envConfig.DASHSCOPE_STD_MODEL || 'qwen3.5-plus';
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || envConfig.DEEPSEEK_API_KEY || '';
export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || envConfig.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
export const STD_BRAIN_MODEL = process.env.STD_BRAIN_MODEL || envConfig.STD_BRAIN_MODEL || 'deepseek-reasoner';
// Local model host
export const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
// Evolution disabled - lightweight focus
export const EVOLUTION_ENABLED = false;
export const CONTAINER_RUNTIME_TYPE = process.env.CONTAINER_RUNTIME_TYPE || 'apple';
export const CONTAINER_RUNTIME_BIN = process.env.KEET_CONTAINER_RUNTIME_BIN || envConfig.KEET_CONTAINER_RUNTIME_BIN || (CONTAINER_RUNTIME_TYPE === 'docker' ? 'docker' : 'container');
function parseBooleanFlag(value, fallback) {
    if (typeof value !== 'string' || value.trim() === '')
        return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
}
function normalizeDeploymentProfile(raw) {
    return raw === 'orchestrator-only' ? 'orchestrator-only' : 'full-execution';
}
function normalizeCoPawMigrationPhase(raw) {
    if (raw === 'copaw-write-warn-legacy-read')
        return 'copaw-write-warn-legacy-read';
    if (raw === 'copaw-only')
        return 'copaw-only';
    return 'dual-read-single-write';
}
export const KEET_DEPLOYMENT_PROFILE = normalizeDeploymentProfile(process.env.KEET_DEPLOYMENT_PROFILE || envConfig.KEET_DEPLOYMENT_PROFILE || 'full-execution');
export const KEET_FULL_EXECUTION_ENABLED = KEET_DEPLOYMENT_PROFILE === 'full-execution';
export const KEET_REQUIRE_CONTAINER_RUNTIME = parseBooleanFlag(process.env.KEET_REQUIRE_CONTAINER_RUNTIME || envConfig.KEET_REQUIRE_CONTAINER_RUNTIME, KEET_FULL_EXECUTION_ENABLED);
export const KEET_REQUIRE_AGENT_IMAGE = parseBooleanFlag(process.env.KEET_REQUIRE_AGENT_IMAGE || envConfig.KEET_REQUIRE_AGENT_IMAGE, KEET_FULL_EXECUTION_ENABLED);
export const KEET_REQUIRE_CLASSIFIER_SIDECAR = parseBooleanFlag(process.env.KEET_REQUIRE_CLASSIFIER_SIDECAR || envConfig.KEET_REQUIRE_CLASSIFIER_SIDECAR, KEET_FULL_EXECUTION_ENABLED);
export const KEET_REQUIRE_COPAW_SIDECAR = parseBooleanFlag(process.env.KEET_REQUIRE_COPAW_SIDECAR || envConfig.KEET_REQUIRE_COPAW_SIDECAR, false);
export const KEET_COPAW_MIGRATION_PHASE = normalizeCoPawMigrationPhase(process.env.KEET_COPAW_MIGRATION_PHASE || envConfig.KEET_COPAW_MIGRATION_PHASE);
export const KEET_COPAW_ALLOW_LEGACY_READS = parseBooleanFlag(process.env.KEET_COPAW_ALLOW_LEGACY_READS || envConfig.KEET_COPAW_ALLOW_LEGACY_READS, KEET_COPAW_MIGRATION_PHASE !== 'copaw-only');
export const KEET_COPAW_WARN_ON_LEGACY_READS = parseBooleanFlag(process.env.KEET_COPAW_WARN_ON_LEGACY_READS || envConfig.KEET_COPAW_WARN_ON_LEGACY_READS, KEET_COPAW_MIGRATION_PHASE === 'copaw-write-warn-legacy-read');
export const KEET_CONTROL_STUB_DEPRECATED_ENDPOINTS = parseBooleanFlag(process.env.KEET_CONTROL_STUB_DEPRECATED_ENDPOINTS || envConfig.KEET_CONTROL_STUB_DEPRECATED_ENDPOINTS, true);
export const KEET_MIGRATION_GATE_MAX_LEGACY_READS = Math.max(0, parseInt(process.env.KEET_MIGRATION_GATE_MAX_LEGACY_READS || envConfig.KEET_MIGRATION_GATE_MAX_LEGACY_READS || '0', 10));
export const COMPACTION_TRIGGER_PCT = parseFloat(process.env.COMPACTION_TRIGGER_PCT || envConfig.COMPACTION_TRIGGER_PCT || '0.40');
export const REBASE_TARGET_PCT = parseFloat(process.env.REBASE_TARGET_PCT || envConfig.REBASE_TARGET_PCT || '0.26');
export const CONTEXT_HARD_STOP_PCT = parseFloat(process.env.CONTEXT_HARD_STOP_PCT || envConfig.CONTEXT_HARD_STOP_PCT || '0.46');
export const PRO_SHARD_STRATEGY = (process.env.PRO_SHARD_STRATEGY || envConfig.PRO_SHARD_STRATEGY || 'off');
export const PRO_MAX_SHARDS_PER_TASK = parseInt(process.env.PRO_MAX_SHARDS_PER_TASK || envConfig.PRO_MAX_SHARDS_PER_TASK || '12', 10);
export const PRO_MAX_CALLS_PER_TASK = parseInt(process.env.PRO_MAX_CALLS_PER_TASK || envConfig.PRO_MAX_CALLS_PER_TASK || '20', 10);
export const PRO_MIN_SHARD_SIZE = parseInt(process.env.PRO_MIN_SHARD_SIZE || envConfig.PRO_MIN_SHARD_SIZE || '300', 10);
export const GLOBAL_DAILY_BUDGET_USD = parseFloat(process.env.GLOBAL_DAILY_BUDGET_USD || envConfig.GLOBAL_DAILY_BUDGET_USD || '25');
export const GLOBAL_MONTHLY_BUDGET_USD = parseFloat(process.env.GLOBAL_MONTHLY_BUDGET_USD || envConfig.GLOBAL_MONTHLY_BUDGET_USD || '500');
export const MODE_BUDGET_ECO_DAILY_USD = parseFloat(process.env.MODE_BUDGET_ECO_DAILY_USD || envConfig.MODE_BUDGET_ECO_DAILY_USD || '2');
export const MODE_BUDGET_STANDARD_DAILY_USD = parseFloat(process.env.MODE_BUDGET_STANDARD_DAILY_USD || envConfig.MODE_BUDGET_STANDARD_DAILY_USD || '10');
export const MODE_BUDGET_PRO_DAILY_USD = parseFloat(process.env.MODE_BUDGET_PRO_DAILY_USD || envConfig.MODE_BUDGET_PRO_DAILY_USD || '15');
export const DEFAULT_TASK_BUDGET_USD = parseFloat(process.env.DEFAULT_TASK_BUDGET_USD || envConfig.DEFAULT_TASK_BUDGET_USD || '5');
export const DEFAULT_SHARD_BUDGET_USD = parseFloat(process.env.DEFAULT_SHARD_BUDGET_USD || envConfig.DEFAULT_SHARD_BUDGET_USD || '1');
export const DEFAULT_ESCALATION_BUDGET_USD = parseFloat(process.env.DEFAULT_ESCALATION_BUDGET_USD || envConfig.DEFAULT_ESCALATION_BUDGET_USD || '2');
export const MAX_RECURSIVE_SHARD_SPLITS = parseInt(process.env.MAX_RECURSIVE_SHARD_SPLITS || envConfig.MAX_RECURSIVE_SHARD_SPLITS || '4', 10);
export const COPAW_ENABLED = (process.env.COPAW_ENABLED || envConfig.COPAW_ENABLED || 'false').toLowerCase() === 'true';
export const COPAW_ROUTE_COMPLEX_PCT = Math.max(0, Math.min(100, parseInt(process.env.COPAW_ROUTE_COMPLEX_PCT || envConfig.COPAW_ROUTE_COMPLEX_PCT || '5', 10)));
export const COPAW_TIMEOUT_MS = parseInt(process.env.COPAW_TIMEOUT_MS || envConfig.COPAW_TIMEOUT_MS || '120000', 10);
export const COPAW_MAX_INFLIGHT = parseInt(process.env.COPAW_MAX_INFLIGHT || envConfig.COPAW_MAX_INFLIGHT || '2', 10);
export const COPAW_FAILURE_CIRCUIT_THRESHOLD = parseInt(process.env.COPAW_FAILURE_CIRCUIT_THRESHOLD || envConfig.COPAW_FAILURE_CIRCUIT_THRESHOLD || '5', 10);
export const COPAW_BASE_URL = process.env.COPAW_BASE_URL || envConfig.COPAW_BASE_URL || 'http://127.0.0.1:8788';
export const COPAW_UPSTREAM_PIN = process.env.COPAW_UPSTREAM_PIN || envConfig.COPAW_UPSTREAM_PIN || 'agentscope-ai/CoPaw@UNPINNED';
export const KEET_MCP_API_STEPS_ENABLED = (process.env.KEET_MCP_API_STEPS_ENABLED || envConfig.KEET_MCP_API_STEPS_ENABLED || 'false').toLowerCase() === 'true';
export const KEET_MCP_CONFIG_PATH = path.resolve(process.env.KEET_MCP_CONFIG_PATH || envConfig.KEET_MCP_CONFIG_PATH || path.join(PROJECT_ROOT, 'store', 'keet-mcp-config.json'));
export const KEET_INTERACTION_LOGGING = parseBooleanFlag(process.env.KEET_INTERACTION_LOGGING || envConfig.KEET_INTERACTION_LOGGING, true);
export const DEDUP_RETENTION_HOURS = parseInt(process.env.DEDUP_RETENTION_HOURS || '24', 10);
//# sourceMappingURL=config.js.map