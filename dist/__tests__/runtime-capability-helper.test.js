import { describe, expect, it } from 'vitest';
import { getRuntimeCapabilityDecision } from '../readiness-decision.js';
import { buildRuntimeCapabilityPayload, getStartupReadinessAction, } from '../runtime-capability-helper.js';
const baseInput = {
    channel: {
        discordOnly: false,
        telegramToken: 'telegram-token',
        discordToken: '',
        legacyDiscordTokenUsed: false,
    },
    deployment: {
        profile: 'full-execution',
        fullExecutionEnabled: true,
        containerRuntimeBin: 'container',
        containerImage: 'nanoclaw-agent:latest',
        requireContainerRuntime: true,
        requireAgentImage: true,
        requireClassifierSidecar: true,
    },
};
describe('runtime capability helper', () => {
    it('marks startup bootable but degraded when direct lane is available', async () => {
        const decision = await getRuntimeCapabilityDecision(baseInput, {
            getDeploymentReadinessChecksImpl: async () => ([
                {
                    code: 'container_runtime_reachable',
                    required: true,
                    ok: false,
                    detail: 'container daemon is unavailable',
                },
                {
                    code: 'container_agent_image',
                    required: true,
                    ok: false,
                    detail: 'agent image is missing',
                },
                {
                    code: 'classifier_sidecar_health',
                    required: true,
                    ok: false,
                    detail: 'classifier sidecar is not reachable',
                },
            ]),
            validateExecutionReadinessImpl: (mode) => ({
                ok: mode === 'eco',
                errors: mode === 'eco' ? [] : [`${mode} unavailable`],
                warnings: [],
                mode,
            }),
        });
        const action = getStartupReadinessAction(decision);
        expect(action.shouldBoot).toBe(true);
        expect(action.degraded).toBe(true);
        expect(action.mode).toBe('degraded');
        expect(action.fatalError).toBeNull();
    });
    it('marks startup blocked when channel boot config is invalid', async () => {
        const decision = await getRuntimeCapabilityDecision({
            ...baseInput,
            channel: {
                discordOnly: false,
                telegramToken: '',
                discordToken: '',
                legacyDiscordTokenUsed: false,
            },
        }, {
            getDeploymentReadinessChecksImpl: async () => ([]),
            validateExecutionReadinessImpl: (mode) => ({
                ok: true,
                errors: [],
                warnings: [],
                mode,
            }),
        });
        const action = getStartupReadinessAction(decision);
        expect(action.shouldBoot).toBe(false);
        expect(action.degraded).toBe(false);
        expect(action.mode).toBe('blocked');
        expect(action.fatalError).toContain('channel_boot_config');
    });
    it('builds an explicit degraded readiness payload with lane breakdown', async () => {
        const decision = await getRuntimeCapabilityDecision(baseInput, {
            getDeploymentReadinessChecksImpl: async () => ([
                {
                    code: 'container_runtime_reachable',
                    required: true,
                    ok: false,
                    detail: 'container daemon is unavailable',
                },
                {
                    code: 'container_agent_image',
                    required: true,
                    ok: false,
                    detail: 'agent image is missing',
                },
                {
                    code: 'classifier_sidecar_health',
                    required: true,
                    ok: false,
                    detail: 'classifier sidecar is not reachable',
                },
            ]),
            validateExecutionReadinessImpl: (mode) => ({
                ok: mode === 'eco',
                errors: mode === 'eco' ? [] : [`${mode} unavailable`],
                warnings: [],
                mode,
            }),
        });
        const payload = buildRuntimeCapabilityPayload(decision);
        expect(payload.degraded_state.active).toBe(true);
        expect(payload.degraded_state.summary).toContain('Bootable in degraded mode');
        expect(payload.lanes.direct.available).toBe(true);
        expect(payload.lanes.container.available).toBe(false);
        expect(payload.lanes.classifier.available).toBe(false);
        expect(payload.lanes.full_execution.available).toBe(false);
    });
    it('builds a full-execution-ready payload when all lanes are available', async () => {
        const decision = await getRuntimeCapabilityDecision(baseInput, {
            getDeploymentReadinessChecksImpl: async () => ([
                {
                    code: 'container_runtime_binary',
                    required: true,
                    ok: true,
                    detail: 'container CLI is available',
                },
                {
                    code: 'container_runtime_reachable',
                    required: true,
                    ok: true,
                    detail: 'container daemon is reachable',
                },
                {
                    code: 'worker_package',
                    required: true,
                    ok: true,
                    detail: 'worker package is present',
                },
                {
                    code: 'worker_source_build',
                    required: true,
                    ok: true,
                    detail: 'worker source build passed',
                },
                {
                    code: 'container_agent_image',
                    required: true,
                    ok: true,
                    detail: 'agent image is available',
                },
                {
                    code: 'classifier_sidecar_health',
                    required: true,
                    ok: true,
                    detail: 'classifier sidecar is healthy',
                },
            ]),
            validateExecutionReadinessImpl: (mode) => ({
                ok: true,
                errors: [],
                warnings: [],
                mode,
            }),
        });
        const payload = buildRuntimeCapabilityPayload(decision);
        expect(payload.degraded_state.active).toBe(false);
        expect(payload.degraded_state.summary).toBeNull();
        expect(payload.full_execution_ready).toBe(true);
        expect(payload.lanes.direct.available).toBe(true);
        expect(payload.lanes.container.available).toBe(true);
        expect(payload.lanes.classifier.available).toBe(true);
        expect(payload.lanes.full_execution.available).toBe(true);
    });
});
//# sourceMappingURL=runtime-capability-helper.test.js.map