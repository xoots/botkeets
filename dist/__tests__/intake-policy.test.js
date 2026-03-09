import { describe, expect, it } from 'vitest';
import { shouldAttemptDirectPath } from '../intake-policy.js';
describe('shouldAttemptDirectPath', () => {
    it('keeps non-coding tasks on the direct path', () => {
        expect(shouldAttemptDirectPath({ task_type: 'chat' })).toBe(true);
        expect(shouldAttemptDirectPath({ task_type: 'social' })).toBe(true);
        expect(shouldAttemptDirectPath({ task_type: 'business' })).toBe(true);
        expect(shouldAttemptDirectPath({ task_type: 'research' })).toBe(true);
    });
    it('keeps coding and complex tasks on the structured/container path', () => {
        expect(shouldAttemptDirectPath({ task_type: 'code' })).toBe(false);
        expect(shouldAttemptDirectPath({ task_type: 'complex' })).toBe(false);
    });
});
//# sourceMappingURL=intake-policy.test.js.map