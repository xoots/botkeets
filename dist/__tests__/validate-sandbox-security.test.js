import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateSandboxMounts } from '../validate-sandbox-security.js';
const tempDirs = [];
function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-mount-'));
    tempDirs.push(dir);
    return dir;
}
afterEach(() => {
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
});
describe('validateSandboxMounts', () => {
    it('passes an approved safe mount', () => {
        const hostPath = makeTempDir();
        expect(validateSandboxMounts([
            { hostPath, containerPath: '/workspace/group', readonly: false },
        ])).toEqual([
            { hostPath: fs.realpathSync(hostPath), containerPath: '/workspace/group', readonly: false },
        ]);
    });
    it('rejects reserved or unsafe mount targets', () => {
        const hostPath = makeTempDir();
        expect(() => validateSandboxMounts([
            { hostPath, containerPath: '/etc', readonly: true },
        ])).toThrow(/reserved|approved/i);
        expect(() => validateSandboxMounts([
            { hostPath, containerPath: '/workspace/group/subdir', readonly: false },
        ])).toThrow(/reserved/i);
    });
    it('rejects traversal-like target shapes', () => {
        const hostPath = makeTempDir();
        expect(() => validateSandboxMounts([
            { hostPath, containerPath: '/workspace/../etc', readonly: true },
        ])).toThrow(/traversal/i);
    });
});
//# sourceMappingURL=validate-sandbox-security.test.js.map