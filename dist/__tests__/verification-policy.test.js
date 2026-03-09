import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock node:child_process and node:fs BEFORE importing the module under test
vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
}));
vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));
import { verifyTaskOutput } from '../verification-policy.js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
const mockExecSync = vi.mocked(execSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
describe('verifyTaskOutput', () => {
    const workspaceDir = '/project/workspace';
    beforeEach(() => {
        vi.resetAllMocks();
    });
    it('1. all files present + passing tests → { passed: true, suggestedAction: proceed }', async () => {
        const taskState = {
            steps: [
                { tool: 'file', status: 'done', outputs: [] },
            ],
        };
        mockExistsSync.mockImplementation((p) => {
            const s = String(p);
            if (s.endsWith('task_state.json'))
                return true;
            if (s.endsWith('package.json'))
                return true;
            return false;
        });
        mockReadFileSync.mockImplementation((p) => {
            const s = String(p);
            if (s.endsWith('task_state.json'))
                return JSON.stringify(taskState);
            if (s.endsWith('package.json'))
                return JSON.stringify({ scripts: { test: 'vitest run' } });
            return '';
        });
        mockExecSync.mockImplementation((cmd) => {
            const c = String(cmd);
            if (c.includes('git diff'))
                return '5 files changed, 120 insertions(+), 30 deletions(-)';
            if (c.includes('npm test'))
                return 'All tests passed\n✓ 42 tests';
            return '';
        });
        const report = await verifyTaskOutput(workspaceDir, 'update existing handler', []);
        expect(report.passed).toBe(true);
        expect(report.suggestedAction).toBe('proceed');
    });
    it('2. missing expected files → { passed: false, suggestedAction: reprompt }', async () => {
        const taskState = {
            steps: [
                {
                    tool: 'file',
                    status: 'done',
                    outputs: ['/project/workspace/src/missing-file.ts created successfully'],
                },
            ],
        };
        mockExistsSync.mockImplementation((p) => {
            const s = String(p);
            if (s.endsWith('task_state.json'))
                return true;
            if (s.endsWith('package.json'))
                return false;
            // missing-file.ts does NOT exist
            return false;
        });
        mockReadFileSync.mockImplementation((p) => {
            const s = String(p);
            if (s.endsWith('task_state.json'))
                return JSON.stringify(taskState);
            return '';
        });
        mockExecSync.mockImplementation((cmd) => {
            const c = String(cmd);
            if (c.includes('git diff'))
                return '1 file changed, 5 insertions(+)';
            return '';
        });
        const report = await verifyTaskOutput(workspaceDir, 'add new feature', []);
        expect(report.passed).toBe(false);
        expect(report.suggestedAction).toBe('reprompt');
        expect(report.repromptHint).toMatch(/missing/i);
    });
    it('3. empty git diff → { passed: false, suggestedAction: reprompt }', async () => {
        mockExistsSync.mockReturnValue(false);
        mockExecSync.mockImplementation((cmd) => {
            const c = String(cmd);
            if (c.includes('git diff'))
                return '';
            return '';
        });
        const report = await verifyTaskOutput(workspaceDir, 'fix the bug', []);
        expect(report.passed).toBe(false);
        expect(report.suggestedAction).toBe('reprompt');
        expect(report.repromptHint).toMatch(/No changes were made/);
    });
    it('4. failing tests → { passed: false, suggestedAction: reprompt, repromptHint containing test output }', async () => {
        mockExistsSync.mockImplementation((p) => {
            const s = String(p);
            if (s.endsWith('task_state.json'))
                return false;
            if (s.endsWith('package.json'))
                return true;
            return false;
        });
        mockReadFileSync.mockImplementation((p) => {
            const s = String(p);
            if (s.endsWith('package.json'))
                return JSON.stringify({ scripts: { test: 'vitest run' } });
            return '';
        });
        const testError = new Error('Tests failed');
        testError.stdout = 'TypeError: Cannot read property id of undefined\n  at test.ts:5:12';
        mockExecSync.mockImplementation((cmd) => {
            const c = String(cmd);
            if (c.includes('git diff'))
                return '2 files changed, 10 insertions(+)';
            if (c.includes('npm test'))
                throw testError;
            return '';
        });
        const report = await verifyTaskOutput(workspaceDir, 'update handler', []);
        expect(report.passed).toBe(false);
        expect(report.suggestedAction).toBe('reprompt');
        expect(report.repromptHint).toMatch(/Tests failed/);
        expect(report.repromptHint).toMatch(/TypeError/);
    });
    it('5. no package.json → test_gate check is pass', async () => {
        mockExistsSync.mockImplementation((p) => {
            const s = String(p);
            if (s.endsWith('task_state.json'))
                return false;
            if (s.endsWith('package.json'))
                return false;
            return false;
        });
        mockExecSync.mockImplementation((cmd) => {
            const c = String(cmd);
            if (c.includes('git diff'))
                return '1 file changed, 5 insertions(+)';
            return '';
        });
        const report = await verifyTaskOutput(workspaceDir, 'update config', []);
        const testGate = report.checks.find(c => c.name === 'test_gate');
        expect(testGate).toBeDefined();
        expect(testGate?.severity).toBe('pass');
    });
    it('6. warn-only checks → { passed: true, suggestedAction: proceed }', async () => {
        // git diff shows 0 insertions, 1200 deletions → warn (suspicious)
        // No task_state.json, no package.json → artifact_exists pass, test_gate pass
        // taskSummary has no create/add/fix → smoke_check warn
        mockExistsSync.mockReturnValue(false);
        mockExecSync.mockImplementation((cmd) => {
            const c = String(cmd);
            if (c.includes('git diff'))
                return '1 file changed, 0 insertions(+), 1200 deletions(-)';
            return '';
        });
        const report = await verifyTaskOutput(workspaceDir, 'refactor code', []);
        const gitCheck = report.checks.find(c => c.name === 'git_diff_sanity');
        expect(gitCheck?.severity).toBe('warn');
        // No 'fail' checks → passed and proceed
        expect(report.passed).toBe(true);
        expect(report.suggestedAction).toBe('proceed');
    });
    it('7. summary string contains one line per check with correct severity prefix', async () => {
        mockExistsSync.mockReturnValue(false);
        mockExecSync.mockImplementation((cmd) => {
            const c = String(cmd);
            if (c.includes('git diff'))
                return '1 file changed, 3 insertions(+)';
            return '';
        });
        const report = await verifyTaskOutput(workspaceDir, 'update existing code', []);
        const lines = report.summary.split('\n');
        expect(lines).toHaveLength(4);
        expect(lines[0]).toMatch(/^\[(PASS|WARN|FAIL)\] artifact_exists:/);
        expect(lines[1]).toMatch(/^\[(PASS|WARN|FAIL)\] git_diff_sanity:/);
        expect(lines[2]).toMatch(/^\[(PASS|WARN|FAIL)\] test_gate:/);
        expect(lines[3]).toMatch(/^\[(PASS|WARN|FAIL)\] smoke_check:/);
    });
});
//# sourceMappingURL=verification-policy.test.js.map