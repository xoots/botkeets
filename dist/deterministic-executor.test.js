import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tryDeterministicExecution } from './deterministic-executor.js';
import { resolveWorkspaceBoundPath } from './runtime-security-policy.js';
function buildMicroTask(description) {
    return {
        id: 'micro-1',
        parent_task_id: 'task-1',
        title: 'test',
        description,
        status: 'pending',
        priority: 1,
        created_at_unix: Date.now(),
    };
}
const tempDirs = [];
function createTempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}
afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
describe('resolveWorkspaceBoundPath', () => {
    it('allows paths inside the workspace root', () => {
        const workspaceDir = createTempDir('workspace-');
        const filePath = path.join(workspaceDir, 'notes.txt');
        expect(resolveWorkspaceBoundPath(filePath, workspaceDir)).toBe(filePath);
    });
    it('rejects paths outside the workspace root', () => {
        const workspaceDir = createTempDir('workspace-');
        const outsideDir = createTempDir('outside-');
        const outsideFile = path.join(outsideDir, 'secret.txt');
        expect(resolveWorkspaceBoundPath(outsideFile, workspaceDir)).toBeNull();
    });
});
describe('tryDeterministicExecution', () => {
    it('reads files only when the requested path stays within the workspace root', async () => {
        const workspaceDir = createTempDir('workspace-');
        const filePath = path.join(workspaceDir, 'allowed.txt');
        fs.writeFileSync(filePath, 'workspace-only');
        const result = await tryDeterministicExecution(buildMicroTask(`read file ${filePath}`), workspaceDir);
        expect(result).toBe('workspace-only');
    });
    it('refuses deterministic reads that escape the workspace root', async () => {
        const workspaceDir = createTempDir('workspace-');
        const outsideDir = createTempDir('outside-');
        const outsideFile = path.join(outsideDir, 'secret.txt');
        fs.writeFileSync(outsideFile, 'do-not-read');
        const result = await tryDeterministicExecution(buildMicroTask(`read file ${outsideFile}`), workspaceDir);
        expect(result).toBeNull();
    });
});
//# sourceMappingURL=deterministic-executor.test.js.map