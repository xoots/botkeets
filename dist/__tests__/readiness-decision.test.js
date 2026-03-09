import { describe, expect, it } from 'vitest';
import { getRuntimeCapabilityDecision, getRuntimeCapabilityStatusReport } from '../readiness-decision.js';
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
describe('getRuntimeCapabilityDecision', () => {
    it('downgrades full-execution blockers when direct/orchestrator execution is available', async () => {
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
        expect(decision.bootable).toBe(true);
        expect(decision.degraded).toBe(true);
        expect(decision.state).toBe('degraded');
        expect(decision.full_execution_ready).toBe(false);
        expect(decision.fatal_blockers).toEqual([]);
        expect(decision.degraded_blockers.map((blocker) => blocker.code)).toEqual([
            'container_runtime_reachable',
            'container_agent_image',
            'classifier_sidecar_health',
        ]);
    });
    it('keeps deployment blockers fatal when no direct/orchestrator path is available', async () => {
        const decision = await getRuntimeCapabilityDecision(baseInput, {
            getDeploymentReadinessChecksImpl: async () => ([
                {
                    code: 'container_runtime_reachable',
                    required: true,
                    ok: false,
                    detail: 'container daemon is unavailable',
                },
            ]),
            validateExecutionReadinessImpl: (mode) => ({
                ok: false,
                errors: [`${mode} unavailable`],
                warnings: [],
                mode,
            }),
        });
        expect(decision.bootable).toBe(false);
        expect(decision.degraded).toBe(false);
        expect(decision.state).toBe('blocked');
        expect(decision.full_execution_ready).toBe(false);
        expect(decision.fatal_blockers).toEqual([
            {
                code: 'container_runtime_reachable',
                detail: 'container daemon is unavailable',
                source: 'deployment',
            },
        ]);
        expect(decision.degraded_blockers).toEqual([]);
    });
    it('treats channel boot config as a hard failure even when direct execution is available', async () => {
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
        expect(decision.bootable).toBe(false);
        expect(decision.state).toBe('blocked');
        expect(decision.fatal_blockers).toEqual([
            {
                code: 'channel_boot_config',
                detail: 'Telegram is required unless DISCORD_ONLY=true',
                source: 'channel',
            },
        ]);
    });
    it('reports concrete missing container capabilities for operator-facing failures', async () => {
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
        const containerStatus = getRuntimeCapabilityStatusReport(decision, 'container_execution');
        const fullExecutionStatus = getRuntimeCapabilityStatusReport(decision, 'full_execution');
        expect(containerStatus.available).toBe(false);
        expect(decision.capabilities.direct_lane.available).toBe(true);
        expect(decision.capabilities.container_lane.available).toBe(false);
        expect(decision.capabilities.classifier.available).toBe(false);
        expect(decision.capabilities.full_execution.available).toBe(false);
        expect(containerStatus.blockers.map((blocker) => blocker.code)).toEqual([
            'container_runtime_reachable',
            'container_agent_image',
        ]);
        expect(fullExecutionStatus.blockers.map((blocker) => blocker.code)).toEqual([
            'container_runtime_reachable',
            'container_agent_image',
            'classifier_sidecar_health',
        ]);
    });
});
//# sourceMappingURL=readiness-decision.test.js.map