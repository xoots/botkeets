import fs from 'fs';
import path from 'path';
import { DEFAULT_ESCALATION_BUDGET_USD, DEFAULT_SHARD_BUDGET_USD, DEFAULT_TASK_BUDGET_USD, GLOBAL_DAILY_BUDGET_USD, GLOBAL_MONTHLY_BUDGET_USD, MODE_BUDGET_ECO_DAILY_USD, MODE_BUDGET_PRO_DAILY_USD, MODE_BUDGET_STANDARD_DAILY_USD, PRO_MAX_CALLS_PER_TASK, PRO_MAX_SHARDS_PER_TASK, PRO_SHARD_STRATEGY, } from './config.js';
const PROJECT_ROOT = process.cwd();
const POLICY_FILE = path.join(PROJECT_ROOT, 'logs', 'budget-policy.json');
const USAGE_FILE = path.join(PROJECT_ROOT, 'logs', 'budget-usage.json');
const DEFAULT_POLICY = {
    global: {
        daily_usd: GLOBAL_DAILY_BUDGET_USD,
        monthly_usd: GLOBAL_MONTHLY_BUDGET_USD,
        rollover: false,
    },
    mode: {
        eco: { daily_usd: MODE_BUDGET_ECO_DAILY_USD },
        standard: { daily_usd: MODE_BUDGET_STANDARD_DAILY_USD },
        pro: { daily_usd: MODE_BUDGET_PRO_DAILY_USD },
    },
    defaults: {
        task_usd: DEFAULT_TASK_BUDGET_USD,
        shard_usd: DEFAULT_SHARD_BUDGET_USD,
        escalation_usd: DEFAULT_ESCALATION_BUDGET_USD,
    },
    task_overrides: {},
    pro: {
        shard_strategy: PRO_SHARD_STRATEGY,
        max_shards_per_task: PRO_MAX_SHARDS_PER_TASK,
        max_calls_per_task: PRO_MAX_CALLS_PER_TASK,
    },
};
function clampMoney(n) {
    return Number.isFinite(n) ? Math.max(0, Number(n.toFixed(6))) : 0;
}
function nowDay() {
    return new Date().toISOString().slice(0, 10);
}
function nowMonth() {
    return new Date().toISOString().slice(0, 7);
}
function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    catch {
        return fallback;
    }
}
function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}
function normalizePolicy(input) {
    return {
        global: {
            daily_usd: clampMoney(input.global?.daily_usd ?? DEFAULT_POLICY.global.daily_usd),
            monthly_usd: clampMoney(input.global?.monthly_usd ?? DEFAULT_POLICY.global.monthly_usd),
            rollover: Boolean(input.global?.rollover ?? DEFAULT_POLICY.global.rollover),
        },
        mode: {
            eco: { daily_usd: clampMoney(input.mode?.eco?.daily_usd ?? DEFAULT_POLICY.mode.eco.daily_usd) },
            standard: { daily_usd: clampMoney(input.mode?.standard?.daily_usd ?? DEFAULT_POLICY.mode.standard.daily_usd) },
            pro: { daily_usd: clampMoney(input.mode?.pro?.daily_usd ?? DEFAULT_POLICY.mode.pro.daily_usd) },
        },
        defaults: {
            task_usd: clampMoney(input.defaults?.task_usd ?? DEFAULT_POLICY.defaults.task_usd),
            shard_usd: clampMoney(input.defaults?.shard_usd ?? DEFAULT_POLICY.defaults.shard_usd),
            escalation_usd: clampMoney(input.defaults?.escalation_usd ?? DEFAULT_POLICY.defaults.escalation_usd),
        },
        task_overrides: input.task_overrides ?? DEFAULT_POLICY.task_overrides ?? {},
        pro: {
            shard_strategy: (input.pro?.shard_strategy ?? DEFAULT_POLICY.pro.shard_strategy),
            max_shards_per_task: Math.max(1, input.pro?.max_shards_per_task ?? DEFAULT_POLICY.pro.max_shards_per_task),
            max_calls_per_task: Math.max(1, input.pro?.max_calls_per_task ?? DEFAULT_POLICY.pro.max_calls_per_task),
        },
    };
}
function defaultUsage() {
    return {
        day: nowDay(),
        month: nowMonth(),
        globalDailySpent: 0,
        globalMonthlySpent: 0,
        modeDailySpent: { eco: 0, standard: 0, pro: 0 },
        tasks: {},
        blockEvents: [],
    };
}
function loadUsage() {
    const usage = readJson(USAGE_FILE, defaultUsage());
    const day = nowDay();
    const month = nowMonth();
    if (usage.day !== day) {
        usage.day = day;
        usage.globalDailySpent = 0;
        usage.modeDailySpent = { eco: 0, standard: 0, pro: 0 };
    }
    if (usage.month !== month) {
        usage.month = month;
        usage.globalMonthlySpent = 0;
    }
    usage.blockEvents = usage.blockEvents.slice(-500);
    return usage;
}
export function getBudgetPolicy() {
    const stored = readJson(POLICY_FILE, {});
    const policy = normalizePolicy(stored);
    writeJson(POLICY_FILE, policy);
    return policy;
}
export function updateBudgetPolicy(patch) {
    const current = getBudgetPolicy();
    const merged = normalizePolicy({
        ...current,
        ...patch,
        global: { ...current.global, ...patch.global },
        mode: {
            eco: { ...current.mode.eco, ...patch.mode?.eco },
            standard: { ...current.mode.standard, ...patch.mode?.standard },
            pro: { ...current.mode.pro, ...patch.mode?.pro },
        },
        defaults: { ...current.defaults, ...patch.defaults },
        pro: { ...current.pro, ...patch.pro },
    });
    writeJson(POLICY_FILE, merged);
    return merged;
}
function estimateCallUsd(mode, provider, isEscalated) {
    if (provider === 'ollama')
        return 0;
    const base = provider === 'claude'
        ? 0.0100
        : provider === 'openrouter'
            ? 0.0020
            : 0.0030;
    const modeMultiplier = mode === 'pro' ? 1.15 : mode === 'eco' ? 0.75 : 1.0;
    const escalationMultiplier = isEscalated ? 1.5 : 1.0;
    return clampMoney(base * modeMultiplier * escalationMultiplier);
}
export function getOrInitTaskSpend(taskId, mode) {
    const usage = loadUsage();
    if (!usage.tasks[taskId]) {
        usage.tasks[taskId] = {
            taskId,
            mode,
            spent: 0,
            escalationSpent: 0,
            calls: 0,
            shards: {},
        };
        writeJson(USAGE_FILE, usage);
    }
    return usage.tasks[taskId];
}
export function evaluateBudget(args) {
    const usage = loadUsage();
    const policy = getBudgetPolicy();
    const expectedUsd = estimateCallUsd(args.mode, args.provider, args.isEscalated);
    const task = usage.tasks[args.taskId] ?? {
        taskId: args.taskId,
        mode: args.mode,
        spent: 0,
        escalationSpent: 0,
        calls: 0,
        shards: {},
    };
    const override = policy.task_overrides?.[args.taskId];
    const taskCap = clampMoney(override?.task_usd ?? policy.defaults.task_usd);
    const shardCap = clampMoney(override?.shard_usd ?? policy.defaults.shard_usd);
    const escalationCap = clampMoney(override?.escalation_usd ?? policy.defaults.escalation_usd);
    const shardSpent = task.shards[args.shardId] ?? 0;
    const statuses = {
        global: {
            spent: usage.globalDailySpent,
            remaining: clampMoney(policy.global.daily_usd - usage.globalDailySpent),
        },
        mode: {
            spent: usage.modeDailySpent[args.mode] ?? 0,
            remaining: clampMoney(policy.mode[args.mode].daily_usd - (usage.modeDailySpent[args.mode] ?? 0)),
        },
        task: {
            spent: task.spent,
            remaining: clampMoney(taskCap - task.spent),
        },
        shard: {
            spent: shardSpent,
            remaining: clampMoney(shardCap - shardSpent),
        },
        escalation: {
            spent: task.escalationSpent,
            remaining: clampMoney(escalationCap - task.escalationSpent),
        },
    };
    let reason;
    if (expectedUsd > statuses.shard.remaining)
        reason = 'blocked_budget_shard';
    else if (args.isEscalated && expectedUsd > statuses.escalation.remaining)
        reason = 'blocked_budget_escalation';
    else if (expectedUsd > statuses.task.remaining)
        reason = 'blocked_budget_task';
    else if (expectedUsd > statuses.mode.remaining)
        reason = 'blocked_budget_mode';
    else if (expectedUsd > statuses.global.remaining)
        reason = 'blocked_budget_global';
    if (reason) {
        usage.blockEvents.push({
            ts: new Date().toISOString(),
            reason,
            taskId: args.taskId,
            mode: args.mode,
            expectedUsd,
        });
        usage.blockEvents = usage.blockEvents.slice(-500);
        writeJson(USAGE_FILE, usage);
        return { allowed: false, reason, expectedUsd, statuses };
    }
    return { allowed: true, expectedUsd, statuses };
}
export function recordSpend(args) {
    const usage = loadUsage();
    const usd = clampMoney(args.explicitUsd ?? estimateCallUsd(args.mode, args.provider, args.isEscalated));
    if (!usage.tasks[args.taskId]) {
        usage.tasks[args.taskId] = {
            taskId: args.taskId,
            mode: args.mode,
            spent: 0,
            escalationSpent: 0,
            calls: 0,
            shards: {},
        };
    }
    const task = usage.tasks[args.taskId];
    task.mode = args.mode;
    task.calls += 1;
    task.spent = clampMoney(task.spent + usd);
    task.shards[args.shardId] = clampMoney((task.shards[args.shardId] ?? 0) + usd);
    if (args.isEscalated)
        task.escalationSpent = clampMoney(task.escalationSpent + usd);
    usage.globalDailySpent = clampMoney(usage.globalDailySpent + usd);
    usage.globalMonthlySpent = clampMoney(usage.globalMonthlySpent + usd);
    usage.modeDailySpent[args.mode] = clampMoney((usage.modeDailySpent[args.mode] ?? 0) + usd);
    writeJson(USAGE_FILE, usage);
    return { addedUsd: usd, task };
}
export function getBudgetUsage() {
    const usage = loadUsage();
    writeJson(USAGE_FILE, usage);
    return {
        day: usage.day,
        month: usage.month,
        globalDailySpent: usage.globalDailySpent,
        globalMonthlySpent: usage.globalMonthlySpent,
        modeDailySpent: usage.modeDailySpent,
        tasks: Object.values(usage.tasks),
        blockEvents: usage.blockEvents.slice(-100),
    };
}
export function getTaskBudgetStatus(taskId) {
    const usage = loadUsage();
    const policy = getBudgetPolicy();
    const task = usage.tasks[taskId] ?? null;
    if (!task)
        return { policy, task: null, statuses: null };
    const override = policy.task_overrides?.[taskId];
    const taskCap = clampMoney(override?.task_usd ?? policy.defaults.task_usd);
    const escalationCap = clampMoney(override?.escalation_usd ?? policy.defaults.escalation_usd);
    return {
        policy,
        task,
        statuses: {
            global: {
                spent: usage.globalDailySpent,
                remaining: clampMoney(policy.global.daily_usd - usage.globalDailySpent),
            },
            mode: {
                spent: usage.modeDailySpent[task.mode] ?? 0,
                remaining: clampMoney(policy.mode[task.mode].daily_usd - (usage.modeDailySpent[task.mode] ?? 0)),
            },
            task: {
                spent: task.spent,
                remaining: clampMoney(taskCap - task.spent),
            },
            escalation: {
                spent: task.escalationSpent,
                remaining: clampMoney(escalationCap - task.escalationSpent),
            },
        },
    };
}
export function getBudgetStatus() {
    const usage = loadUsage();
    const policy = normalizePolicy(readJson(POLICY_FILE, {}));
    return {
        eco: {
            remaining: clampMoney(policy.mode.eco.daily_usd - (usage.modeDailySpent.eco ?? 0)),
            affordable: (usage.modeDailySpent.eco ?? 0) < policy.mode.eco.daily_usd,
        },
        standard: {
            remaining: clampMoney(policy.mode.standard.daily_usd - (usage.modeDailySpent.standard ?? 0)),
            affordable: (usage.modeDailySpent.standard ?? 0) < policy.mode.standard.daily_usd,
        },
        pro: {
            remaining: clampMoney(policy.mode.pro.daily_usd - (usage.modeDailySpent.pro ?? 0)),
            affordable: (usage.modeDailySpent.pro ?? 0) < policy.mode.pro.daily_usd,
        },
    };
}
//# sourceMappingURL=budget-policy.js.map