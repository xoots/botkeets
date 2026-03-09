/**
 * orchestration-extract.test.ts
 *
 * Tests for Sprint B extracted policy modules:
 *   - intakeAndClassify()  (intake-policy.ts)
 *   - approveAndClarify()  (approval-policy.ts)
 *   - executeAndFinalize() (execution-lifecycle.ts)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
// ── Module mocks (must come before any imports from the modules under test) ───
vi.mock('../db.js', () => ({
    getNewMessages: vi.fn(),
    getRegisteredGroup: vi.fn(() => ({ folder: 'main', name: 'test-group', jid: 'jid:123', trigger: '@keet', added_at: '2026-01-01' })),
    upsertCanonicalSummary: vi.fn(),
}));
vi.mock('../task-classifier.js', () => ({
    classifyTask: vi.fn(),
}));
vi.mock('../direct-runner.js', () => ({
    runDirectForGroup: vi.fn(),
}));
vi.mock('../pro-shard-pending-store.js', () => ({
    findPendingProShardTaskByGroup: vi.fn(() => null),
    clearPendingProShardTask: vi.fn(),
    savePendingProShardTask: vi.fn(),
}));
vi.mock('../pro-shard-approvals.js', () => ({
    getProShardApproval: vi.fn(() => null),
}));
vi.mock('../clarification-store.js', () => ({
    hasPending: vi.fn(() => false),
    getPending: vi.fn(() => null),
    clearPending: vi.fn(),
    parseAnswers: vi.fn(() => ({})),
    setPending: vi.fn(),
}));
vi.mock('../task-runner.js', () => ({
    runTask: vi.fn(),
}));
vi.mock('../overseer.js', () => ({
    evaluateResult: vi.fn(),
}));
vi.mock('../pr-automation.js', () => ({
    attemptPrCreation: vi.fn(),
}));
vi.mock('../task-registry.js', () => ({
    registerTask: vi.fn(),
    updateTask: vi.fn(),
}));
vi.mock('../memory-session.js', () => ({
    loadMemoryForTask: vi.fn(() => null),
}));
vi.mock('../execution-run-history.js', () => ({
    appendExecutionRunHistory: vi.fn(),
}));
vi.mock('../runtime-split.js', () => ({
    markKeetTaskRun: vi.fn(),
}));
vi.mock('../project-workspace.js', () => ({
    readVault: vi.fn(() => ({})),
}));
vi.mock('../copaw-lane-bridge.js', () => ({
    getCoPawLaneHealth: vi.fn(() => ({ circuit_open: false })),
}));
vi.mock('../execution-routing.js', () => ({
    normalizeRoutingInput: vi.fn((content) => content),
    resolveExecutionRoutingContext: vi.fn(() => ({
        requested_mode: null,
        effective_mode: 'standard',
        source: 'chat_default',
        inline_override: null,
        clean_content: 'test message',
        lane: 'keet_execution',
    })),
    resolveExecutionLaneDecision: vi.fn(() => ({
        lane: 'keet_execution',
        copaw_eligible: false,
        reason: 'test',
    })),
}));
vi.mock(import("../config.js"), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ASSISTANT_NAME: 'keet',
        COPAW_ENABLED: false,
        REQUIRE_PLAN_APPROVAL: undefined,
    };
});
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../group-queue.js', () => ({
    setGroupConcurrency: vi.fn(),
}));
vi.mock('../override-parser.js', () => ({
    parseOverrides: vi.fn(() => ({ skipPlanApproval: false, parallelOverride: 1, modeOverride: null, content: 'test', clean_content: 'test' })),
}));
vi.mock('../verification-policy.js', () => ({
    verifyTaskOutput: vi.fn(async () => ({ passed: true, summary: 'ok', suggestedAction: 'proceed', checks: [] })),
}));
vi.mock('../memory-mem0-extractor.js', () => ({
    extractMem0Facts: vi.fn(async () => ({ facts: null })),
}));
vi.mock('../memory-project-resolver.js', () => ({
    resolveProjectIdFromContent: vi.fn(() => null),
    autoRegisterProject: vi.fn(),
}));
vi.mock('../pre-task-reflection.js', () => ({
    scanForAdjustments: vi.fn(() => ({ hints: [] })),
    formatAdjustmentHints: vi.fn(() => ''),
}));
vi.mock('../group-memory.js', () => ({
    assembleGroupMemoryAnchor: vi.fn(() => ''),
    appendToJournal: vi.fn(),
    mergeIntoMemory: vi.fn(),
}));
vi.mock('../drip-feed-executor.js', () => ({
    dripFeedExecute: vi.fn(),
}));
// ── Imports after mocks ───────────────────────────────────────────────────────
import { intakeAndClassify } from '../intake-policy.js';
import { approveAndClarify } from '../approval-policy.js';
import { executeAndFinalize } from '../execution-lifecycle.js';
import { getNewMessages } from '../db.js';
import { classifyTask } from '../task-classifier.js';
import { runDirectForGroup } from '../direct-runner.js';
import { hasPending } from '../clarification-store.js';
import { runTask } from '../task-runner.js';
import { evaluateResult } from '../overseer.js';
import { attemptPrCreation } from '../pr-automation.js';
import { registerTask, updateTask } from '../task-registry.js';
// ── Helpers ───────────────────────────────────────────────────────────────────
const mockChannel = {
    sendMessage: vi.fn(async () => { }),
    setTyping: vi.fn(async () => { }),
};
const noopContainerExecute = vi.fn(async () => 'ok');
function makeClassifierResult(task_type = 'complex') {
    return {
        task_type,
        complexity: 'high',
        quality_stakes: 'high',
        recommended_mode: 'standard',
        reasoning: 'test',
        usedFallback: false,
    };
}
function makePlanResult(overrides = {}) {
    return {
        workspace: {
            id: 'test-workspace-id',
            workspaceDir: '/tmp/workspace',
            outputDir: '/tmp/output',
            taskFile: '/tmp/task.md',
            progressFile: '/tmp/progress.log',
            vaultFile: '/tmp/vault.env',
            dir: '/tmp',
        },
        subtasks: overrides.subtasks ?? [],
        clarifications: overrides.clarifications ?? [],
        planMarkdown: 'Plan verified ✓',
        needsContainer: true,
        credentialKeys: [],
        needs_decomposition: overrides.needs_decomposition ?? false,
    };
}
function makeTaskRunResult(success = true) {
    return {
        success,
        mode: 'structured',
        finalMode: 'structured',
        stepsCompleted: 1,
        stepsFailed: 0,
        escapeHatchTriggered: false,
        outputs: ['Task completed successfully'],
    };
}
// ── intakeAndClassify tests ───────────────────────────────────────────────────
describe('intakeAndClassify()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(hasPending).mockReturnValue(false);
    });
    it('returns no_messages when there are no new messages', async () => {
        vi.mocked(getNewMessages).mockReturnValue({ messages: [], newTimestamp: '' });
        const result = await intakeAndClassify('jid:123', mockChannel, '', noopContainerExecute);
        expect(result.kind).toBe('no_messages');
    });
    it('returns handled_direct for social messages handled by direct runner', async () => {
        vi.mocked(getNewMessages).mockReturnValue({
            messages: [{ id: 'msg-1', content: 'hi', sender: 'user', sender_name: 'User', chat_jid: 'jid:123', timestamp: '2026-01-01', is_from_me: false, is_bot_message: false }],
            newTimestamp: '2026-01-01T00:00:01Z',
        });
        vi.mocked(classifyTask).mockResolvedValue(makeClassifierResult('social'));
        vi.mocked(runDirectForGroup).mockResolvedValue({ handled: true, lane_used: 'keet' });
        const result = await intakeAndClassify('jid:123', mockChannel, '', noopContainerExecute);
        expect(result.kind).toBe('handled_direct');
    });
    it('returns needs_planning for complex messages', async () => {
        vi.mocked(getNewMessages).mockReturnValue({
            messages: [{ id: 'msg-2', content: 'write me a complex bash script', sender: 'user', sender_name: 'User', chat_jid: 'jid:123', timestamp: '2026-01-01', is_from_me: false, is_bot_message: false }],
            newTimestamp: '2026-01-01T00:00:02Z',
        });
        vi.mocked(classifyTask).mockResolvedValue(makeClassifierResult('complex'));
        vi.mocked(hasPending).mockReturnValue(false);
        const result = await intakeAndClassify('jid:123', mockChannel, '', noopContainerExecute);
        expect(result.kind).toBe('needs_planning');
        if (result.kind === 'needs_planning') {
            expect(result.messages).toHaveLength(1);
            expect(result.classification.task_type).toBe('complex');
        }
    });
});
// ── approveAndClarify tests ───────────────────────────────────────────────────
describe('approveAndClarify()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Ensure REQUIRE_PLAN_APPROVAL env is not set
        delete process.env.REQUIRE_PLAN_APPROVAL;
    });
    it('returns paused_for_approval with clarification reason when plan has questions', async () => {
        const planResult = makePlanResult({
            clarifications: [{ id: 'q1', question: 'What scope?', options: ['full', 'partial'], required: true }],
        });
        const routingCtx = {
            requested_mode: null,
            effective_mode: 'standard',
            source: 'chat_default',
            inline_override: null,
            clean_content: 'test',
        };
        const result = await approveAndClarify(planResult, 'test task', 'jid:123', mockChannel, routingCtx);
        expect(result.kind).toBe('paused_for_approval');
        if (result.kind === 'paused_for_approval') {
            expect(result.reason).toBe('clarification');
        }
        expect(mockChannel.sendMessage).toHaveBeenCalledOnce();
    });
    it('returns approved with structured execMode when plan is clean', async () => {
        const planResult = makePlanResult({ clarifications: [] });
        const routingCtx = {
            requested_mode: null,
            effective_mode: 'standard',
            source: 'chat_default',
            inline_override: null,
            clean_content: 'test',
        };
        const result = await approveAndClarify(planResult, 'test task', 'jid:123', mockChannel, routingCtx);
        expect(result.kind).toBe('approved');
        if (result.kind === 'approved') {
            expect(result.execMode).toBe('structured');
            expect(result.planResult).toBe(planResult);
        }
    });
});
// ── executeAndFinalize tests ──────────────────────────────────────────────────
describe('executeAndFinalize()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(registerTask).mockReturnValue({});
        vi.mocked(updateTask).mockReturnValue(undefined);
    });
    it('returns success=true with PR info on successful task completion', async () => {
        const planResult = makePlanResult();
        const taskResult = makeTaskRunResult(true);
        const routingCtx = {
            requested_mode: null,
            effective_mode: 'standard',
            source: 'chat_default',
            inline_override: null,
            clean_content: 'test',
        };
        vi.mocked(runTask).mockResolvedValue(taskResult);
        vi.mocked(evaluateResult).mockResolvedValue({ action: 'complete' });
        vi.mocked(attemptPrCreation).mockResolvedValue({
            prNumber: 42,
            prUrl: 'https://github.com/owner/repo/pull/42',
            branch: 'feat/test-workspace-id',
        });
        const result = await executeAndFinalize(planResult, 'structured', 'jid:123', mockChannel, noopContainerExecute, {}, routingCtx, { taskSummary: 'test task' });
        expect(result.success).toBe(true);
        expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42');
        expect(result.prNumber).toBe(42);
        expect(result.overseerAction.action).toBe('complete');
        expect(registerTask).toHaveBeenCalledOnce();
        expect(updateTask).toHaveBeenCalledOnce();
    });
});
//# sourceMappingURL=orchestration-extract.test.js.map