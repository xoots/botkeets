import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    childLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));
vi.mock('../routing-logger.js', () => ({
    logRoutingDecision: vi.fn(),
}));
vi.mock('../step-routing-logger.js', () => ({
    logStepRoutingDecision: vi.fn(),
}));
vi.mock('../budget-policy.js', () => ({
    getOrInitTaskSpend: vi.fn(() => ({ spent: 0, calls: 0, escalationSpent: 0 })),
}));
vi.mock('../copaw-system.js', () => ({
    getKeetMcpAdapterState: vi.fn(async () => ({ enabled_clients: [], warnings: [] })),
    executeKeetMcpApiStep: vi.fn(async () => ({ handled: false, success: false, output: '' })),
}));
vi.mock('../keet-provider-config.js', () => ({
    getKeetProviderCapability: vi.fn(() => ({ compatible_with_keet: true })),
    resolvePrimaryProviderForMode: vi.fn(() => ({ provider_id: 'ollama', model: 'qwen3:8b' })),
    validateKeetExecutionReadiness: vi.fn(() => ({ ok: true, errors: [], warnings: [] })),
}));
vi.mock('../task-registry.js', () => ({
    updateTask: vi.fn(),
}));
vi.mock('../app-infra/authority/platform-authority-service.js', () => ({
    platformAuthorityService: {
        authorizeTaskStart: vi.fn(() => ({ allowed: true, enforcedMaxCalls: 4, reason: 'allowed' })),
        authorizeCanExecute: vi.fn(() => ({ allowed: true, reason: 'allowed' })),
        recordApprovedSpend: vi.fn(),
    },
}));
vi.mock('../reasoning/per-step-planning.js', () => ({
    buildExecutionOrder: vi.fn((steps) => steps),
}));
vi.mock('../step-router.js', () => ({
    decideStepRouting: vi.fn((subtask) => ({
        step: subtask.step,
        tool: subtask.tool,
        risk_level: 'low',
        criticality_tags: [],
        provider: 'ollama',
        model: 'qwen3:8b',
        max_retries: 2,
        escalation_target: null,
        attempt: 0,
        is_escalated: false,
        override_source: 'chat_default',
        effective_mode: 'standard',
        lane_used: 'keet_execution',
    })),
}));
vi.mock('../reasoning/action-selection.js', () => ({
    selectConstrainedStepAction: vi.fn(() => 'fail'),
}));
vi.mock('../reasoning/sharding.js', () => ({
    initialShard: vi.fn((step, text) => ({
        id: `shard-${step}`,
        index: 1,
        total: 1,
        text,
        depth: 0,
    })),
    applyShardOutcome: vi.fn(({ rawOutput }) => ({
        completedOutput: rawOutput,
        nextQueue: [],
    })),
}));
vi.mock('../reasoning/anchor-context.js', () => ({
    selectPerShardContextTokens: vi.fn(() => 32000),
}));
vi.mock('../trigger/tasks.js', () => ({
    dispatchKeetTask: vi.fn(),
}));
vi.mock('../memory-subagent-contract.js', () => ({
    parseMVPSubagentOutput: vi.fn(() => null),
    resolveModelTierFromAgentType: vi.fn(() => 'standard'),
}));
import { runTask } from '../task-runner.js';
describe('runTask()', () => {
    const channel = {
        sendMessage: vi.fn(async () => { }),
    };
    beforeEach(() => {
        vi.clearAllMocks();
    });
    afterEach(() => {
        vi.clearAllMocks();
    });
    it('executes the structured container path in standalone mode', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keet-task-runner-'));
        const workspaceDir = path.join(root, 'workspace');
        const outputDir = path.join(root, 'output');
        fs.mkdirSync(workspaceDir, { recursive: true });
        fs.mkdirSync(outputDir, { recursive: true });
        const containerExecute = vi.fn(async () => 'created /tmp/output/result.txt');
        const plan = {
            workspace: {
                id: 'smoke-workspace',
                workspaceDir,
                outputDir,
                taskFile: path.join(root, 'task.md'),
                progressFile: path.join(root, 'progress.log'),
                vaultFile: path.join(root, 'vault.env'),
                dir: root,
            },
            subtasks: [
                {
                    step: 1,
                    description: 'Create the requested artifact',
                    tool: 'bash',
                    dependsOn: [],
                    estimatedMs: 1000,
                },
            ],
            clarifications: [],
            planMarkdown: 'Create the requested artifact',
            needsContainer: true,
            credentialKeys: [],
            needs_decomposition: false,
        };
        const result = await runTask(plan, channel, 'tg:123', containerExecute, {}, {
            mode: 'structured',
            routingContext: {
                requested_mode: null,
                effective_mode: 'standard',
                source: 'chat_default',
                inline_override: null,
                clean_content: 'Create the requested artifact',
                lane: 'keet_execution',
                lane_reason: 'smoke_test',
            },
        });
        expect(result.success).toBe(true);
        expect(result.stepsCompleted).toBe(1);
        expect(result.finalMode).toBe('structured');
        expect(containerExecute).toHaveBeenCalledTimes(1);
        expect(result.outputs).toContain('Step 1: created /tmp/output/result.txt');
        expect(fs.existsSync(path.join(root, 'task_state.json'))).toBe(true);
    });
});
//# sourceMappingURL=task-runner-smoke.test.js.map