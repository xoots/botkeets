import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../step-router.js', () => ({
    decideStepRouting: vi.fn(() => ({
        step: 1,
        tool: 'bash',
        risk_level: 'low',
        criticality_tags: [],
        provider: 'openrouter',
        model: 'qwen/qwen3-coder-flash',
        max_retries: 2,
        escalation_target: { provider: 'claude', model: 'claude-sonnet-4-6' },
        attempt: 1,
        is_escalated: false,
        override_source: 'chat_default',
        effective_mode: 'standard',
        lane_used: 'keet_execution',
    })),
}));
vi.mock('../deterministic-executor.js', () => ({
    tryDeterministicExecution: vi.fn(async () => null),
}));
vi.mock('../failure-reflection.js', () => ({
    reflectOnFailure: vi.fn(async () => ({
        action: 'retry',
        root_cause: 'test',
    })),
}));
vi.mock('../memory-signal-emitter.js', () => ({
    emitSignal: vi.fn(),
}));
vi.mock('../memory-project-resolver.js', () => ({
    resolveProjectIdFromContent: vi.fn(() => null),
}));
vi.mock('../episodic-compression.js', () => ({
    appendEpisodeToProjectMemory: vi.fn(),
}));
vi.mock('../skill-loader.js', () => ({
    getSkillHints: vi.fn(() => ''),
}));
import { dripFeedExecute } from '../drip-feed-executor.js';
describe('dripFeedExecute', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('treats STEP_FAILED outputs as failed steps', async () => {
        const result = await dripFeedExecute({
            workspace: {
                id: 'smoke-task',
                workspaceDir: '/tmp/smoke-task',
                outputDir: '/tmp/smoke-task/output',
                taskFile: '/tmp/smoke-task/task.md',
                progressFile: '/tmp/smoke-task/progress.log',
                vaultFile: '/tmp/smoke-task/vault.env',
                dir: '/tmp/smoke-task',
            },
            subtasks: [
                {
                    step: 1,
                    description: 'Inspect the repo and summarize the result',
                    tool: 'bash',
                    dependsOn: [],
                    estimatedMs: 1000,
                },
            ],
            clarifications: [],
            planMarkdown: 'Inspect the repo and summarize the result',
            needsContainer: true,
            credentialKeys: [],
            needs_decomposition: false,
        }, { sendMessage: vi.fn() }, 'tg:test', vi.fn(async () => 'STEP_FAILED: provider rejected the model'), {
            routingContext: {
                requested_mode: null,
                effective_mode: 'standard',
                source: 'chat_default',
                inline_override: null,
                clean_content: 'inspect the repo',
                lane: 'keet_execution',
            },
        });
        expect(result.success).toBe(false);
        expect(result.stepsCompleted).toBe(0);
        expect(result.stepsFailed).toBe(1);
        expect(result.outputs).toEqual([]);
        expect(result.escapeHatchTriggered).toBe(true);
    });
});
//# sourceMappingURL=drip-feed-executor.test.js.map