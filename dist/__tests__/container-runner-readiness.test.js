import { describe, expect, it } from 'vitest';
import { formatContainerCapabilityFailureMessage } from '../container-runner.js';
describe('container runner degraded-mode messaging', () => {
    it('explains degraded mode when a complex task needs the container lane', () => {
        const message = formatContainerCapabilityFailureMessage({
            capability: 'container_execution',
            available: false,
            detail: 'container_runtime_reachable: container daemon is unavailable; container_agent_image: agent image is missing',
            blockers: [
                {
                    code: 'container_runtime_reachable',
                    detail: 'container daemon is unavailable',
                    source: 'deployment',
                },
                {
                    code: 'container_agent_image',
                    detail: 'agent image is missing',
                    source: 'deployment',
                },
            ],
        }, {
            capability: 'full_execution',
            available: false,
            detail: 'classifier_sidecar_health: classifier sidecar is not reachable',
            blockers: [
                {
                    code: 'container_runtime_reachable',
                    detail: 'container daemon is unavailable',
                    source: 'deployment',
                },
                {
                    code: 'container_agent_image',
                    detail: 'agent image is missing',
                    source: 'deployment',
                },
                {
                    code: 'classifier_sidecar_health',
                    detail: 'classifier sidecar is not reachable',
                    source: 'deployment',
                },
            ],
        });
        expect(message).toContain('Keets is running in degraded mode on this host');
        expect(message).toContain('container lane is unavailable');
        expect(message).toContain('container_runtime_reachable');
        expect(message).toContain('classifier_sidecar_health');
        expect(message).toContain('Direct-path chat, research, and business flows remain available');
    });
});
//# sourceMappingURL=container-runner-readiness.test.js.map