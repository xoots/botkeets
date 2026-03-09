/**
 * Verification Policy — validates task artifacts before PR creation.
 * Called after runTask() succeeds, before overseer evaluation.
 * Pure: reads filesystem + runs commands only. No network, no state mutation.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
/**
 * Run verification checks on a completed task workspace.
 * Called after runTask() succeeds, before PR creation.
 */
export async function verifyTaskOutput(workspaceDir, taskSummary, taskOutputs) {
    const checks = [];
    const missingFiles = [];
    // ── 1. Artifact existence ─────────────────────────────────────────────────────
    // task_state.json lives one directory ABOVE workspaceDir
    const projectDir = path.dirname(workspaceDir);
    const taskStatePath = path.join(projectDir, 'task_state.json');
    if (existsSync(taskStatePath)) {
        try {
            const taskState = JSON.parse(readFileSync(taskStatePath, 'utf-8'));
            const steps = taskState.steps ?? [];
            for (const step of steps) {
                if ((step.tool === 'file' || step.tool === 'bash') && step.outputs?.length) {
                    for (const output of step.outputs) {
                        // Extract file paths — lines starting with / or relative paths with extensions
                        const filePaths = output.match(/(?:^|\s)((?:\/|\.\/|src\/|dist\/|test\/)[^\s,;'"`]+\.[a-zA-Z0-9]+)/g);
                        if (filePaths) {
                            for (const fp of filePaths) {
                                const trimmed = fp.trim();
                                const absPath = trimmed.startsWith('/') ? trimmed : path.join(workspaceDir, trimmed);
                                if (!existsSync(absPath)) {
                                    missingFiles.push(trimmed);
                                }
                            }
                        }
                    }
                }
            }
        }
        catch (err) {
            logger.debug({ err }, 'verification: could not parse task_state.json');
        }
    }
    if (missingFiles.length > 0) {
        checks.push({
            name: 'artifact_exists',
            severity: 'fail',
            message: `Missing expected output files: ${missingFiles.join(', ')}`,
        });
    }
    else {
        checks.push({
            name: 'artifact_exists',
            severity: 'pass',
            message: 'All expected output files present',
        });
    }
    // ── 2. Git diff sanity ────────────────────────────────────────────────────────
    let gitCheck;
    try {
        const diffOutput = execSync('git diff --stat HEAD', {
            cwd: workspaceDir,
            timeout: 15_000,
            encoding: 'utf-8',
        });
        if (!diffOutput.trim()) {
            gitCheck = {
                name: 'git_diff_sanity',
                severity: 'fail',
                message: 'No changes detected in workspace (empty git diff)',
            };
        }
        else {
            // Check summary line for suspicious large deletions with no insertions
            const summaryMatch = diffOutput.match(/(\d+) insertion[^,]*,\s*(\d+) deletion/);
            let suspiciousDeletion = false;
            if (summaryMatch) {
                const insertions = parseInt(summaryMatch[1], 10);
                const deletions = parseInt(summaryMatch[2], 10);
                if (deletions > 1000 && insertions === 0) {
                    suspiciousDeletion = true;
                }
            }
            else {
                // Check for deletions-only summary (no insertions line)
                const deletionsOnly = diffOutput.match(/(\d+) deletion/);
                const insertionsCheck = diffOutput.match(/(\d+) insertion/);
                if (deletionsOnly && !insertionsCheck) {
                    const deletions = parseInt(deletionsOnly[1], 10);
                    if (deletions > 1000)
                        suspiciousDeletion = true;
                }
            }
            if (suspiciousDeletion) {
                gitCheck = {
                    name: 'git_diff_sanity',
                    severity: 'warn',
                    message: 'Suspicious: large deletion (>1000 lines) without additions detected',
                };
            }
            else {
                const summaryLine = diffOutput.split('\n').find(l => l.match(/\d+ file.* changed/))?.trim() ??
                    diffOutput.trim().split('\n').pop() ??
                    'Changes detected';
                gitCheck = {
                    name: 'git_diff_sanity',
                    severity: 'pass',
                    message: summaryLine,
                };
            }
        }
    }
    catch (err) {
        gitCheck = {
            name: 'git_diff_sanity',
            severity: 'warn',
            message: `Could not run git diff: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    checks.push(gitCheck);
    // ── 3. Test gate ──────────────────────────────────────────────────────────────
    let testCheck;
    const pkgJsonPath = path.join(workspaceDir, 'package.json');
    if (existsSync(pkgJsonPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
            const testScript = pkg.scripts?.['test'];
            const hasRealTestScript = testScript != null &&
                testScript !== 'echo "Error: no test specified" && exit 1' &&
                testScript.trim() !== '';
            if (hasRealTestScript) {
                try {
                    const testOutput = execSync('npm test', {
                        cwd: workspaceDir,
                        timeout: 60_000,
                        encoding: 'utf-8',
                    });
                    testCheck = {
                        name: 'test_gate',
                        severity: 'pass',
                        message: `Tests passed: ${testOutput.slice(0, 200)}`,
                    };
                }
                catch (err) {
                    const e = err;
                    const rawOutput = (e.stdout ?? e.stderr ?? e.message ?? String(err)).slice(0, 500);
                    testCheck = {
                        name: 'test_gate',
                        severity: 'fail',
                        message: `Tests failed: ${rawOutput}`,
                    };
                }
            }
            else {
                testCheck = {
                    name: 'test_gate',
                    severity: 'pass',
                    message: 'No test script configured',
                };
            }
        }
        catch (err) {
            testCheck = {
                name: 'test_gate',
                severity: 'pass',
                message: 'Could not parse package.json — skipping test gate',
            };
        }
    }
    else {
        testCheck = {
            name: 'test_gate',
            severity: 'pass',
            message: 'No package.json found — no tests to run',
        };
    }
    checks.push(testCheck);
    // ── 4. Smoke check ────────────────────────────────────────────────────────────
    let smokeCheck;
    const summaryLower = taskSummary.toLowerCase();
    if ((summaryLower.includes('create') || summaryLower.includes('add')) &&
        taskSummary.match(/\.[a-zA-Z0-9]+/)) {
        // Look for filenames mentioned in the summary
        const fileMatches = taskSummary.match(/\b[\w-]+\.[a-zA-Z0-9]+\b/g) ?? [];
        if (fileMatches.length > 0) {
            const missingSmoke = [];
            for (const fname of fileMatches) {
                const fpath = path.join(workspaceDir, fname);
                if (!existsSync(fpath)) {
                    missingSmoke.push(fname);
                }
            }
            if (missingSmoke.length > 0) {
                smokeCheck = {
                    name: 'smoke_check',
                    severity: 'fail',
                    message: `Expected created file(s) not found: ${missingSmoke.join(', ')}`,
                };
            }
            else {
                smokeCheck = {
                    name: 'smoke_check',
                    severity: 'pass',
                    message: `Created file(s) exist: ${fileMatches.join(', ')}`,
                };
            }
        }
        else {
            smokeCheck = {
                name: 'smoke_check',
                severity: 'warn',
                message: 'Could not determine expected files from task summary',
            };
        }
    }
    else if (summaryLower.includes('fix')) {
        // Grep for error patterns from outputs — they should be gone
        const combined = taskOutputs.join('\n');
        const errorPatterns = combined.match(/error[:\s]+[^\n]{5,50}/gi)?.slice(0, 3) ?? [];
        if (errorPatterns.length > 0) {
            let foundError = false;
            try {
                for (const pattern of errorPatterns) {
                    // Sanitize: only keep alphanumeric, spaces, dots, underscores
                    const safe = pattern.replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 40);
                    if (!safe.trim())
                        continue;
                    const grepResult = execSync(`grep -r "${safe}" . --include="*.ts" --include="*.js" -l 2>/dev/null || true`, { cwd: workspaceDir, timeout: 10_000, encoding: 'utf-8' });
                    if (grepResult.trim()) {
                        foundError = true;
                        break;
                    }
                }
            }
            catch {
                // ignore grep errors
            }
            smokeCheck = {
                name: 'smoke_check',
                severity: foundError ? 'fail' : 'pass',
                message: foundError
                    ? 'Error pattern still present in workspace'
                    : 'Error patterns appear to be resolved',
            };
        }
        else {
            smokeCheck = {
                name: 'smoke_check',
                severity: 'warn',
                message: 'Fix task — could not determine specific error to verify',
            };
        }
    }
    else {
        smokeCheck = {
            name: 'smoke_check',
            severity: 'warn',
            message: 'No specific smoke check applicable for this task type',
        };
    }
    checks.push(smokeCheck);
    // ── Build summary ─────────────────────────────────────────────────────────────
    const summary = checks
        .map(c => {
        const prefix = c.severity === 'pass' ? '[PASS]' : c.severity === 'warn' ? '[WARN]' : '[FAIL]';
        return `${prefix} ${c.name}: ${c.message}`;
    })
        .join('\n');
    // ── Determine suggestedAction ─────────────────────────────────────────────────
    const failedChecks = checks.filter(c => c.severity === 'fail');
    const hasFailures = failedChecks.length > 0;
    let suggestedAction = 'proceed';
    let repromptHint;
    if (hasFailures) {
        suggestedAction = 'reprompt';
        const testFail = checks.find(c => c.name === 'test_gate' && c.severity === 'fail');
        const artifactFail = checks.find(c => c.name === 'artifact_exists' && c.severity === 'fail');
        const gitFail = checks.find(c => c.name === 'git_diff_sanity' && c.severity === 'fail');
        if (testFail) {
            repromptHint = `Tests failed: ${testFail.message.replace(/^Tests failed:\s*/, '')}. Fix the failing tests before completing.`;
        }
        else if (artifactFail) {
            repromptHint = `Expected output files are missing: ${missingFiles.join(', ')}. Create them.`;
        }
        else if (gitFail) {
            repromptHint = 'No changes were made in the workspace. The task requires code changes.';
        }
        else {
            repromptHint = failedChecks.map(c => c.message).join('; ');
        }
    }
    logger.debug({ checks, suggestedAction }, 'verification-policy: complete');
    return {
        checks,
        passed: !hasFailures,
        summary,
        suggestedAction,
        repromptHint,
    };
}
//# sourceMappingURL=verification-policy.js.map