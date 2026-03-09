/**
 * Skill Loader — loads SKILL.md routing hints for micro-task roles.
 * Cached in memory after first load. Returns empty string if not found.
 */
import fs from 'node:fs';
import path from 'node:path';
const skillCache = new Map();
function getSkillsDir() {
    return path.join(process.cwd(), 'data', 'skills');
}
export function loadSkill(role) {
    const cached = skillCache.get(role);
    if (cached !== undefined)
        return cached;
    try {
        const file = path.join(getSkillsDir(), `${role}.SKILL.md`);
        if (!fs.existsSync(file)) {
            skillCache.set(role, '');
            return '';
        }
        const content = fs.readFileSync(file, 'utf-8');
        skillCache.set(role, content);
        return content;
    }
    catch {
        skillCache.set(role, '');
        return '';
    }
}
export function inferRole(description) {
    const lower = description.toLowerCase();
    if (/\b(tests?|verify|checks?|validates?|qa|asserts?|specs?)\b/.test(lower))
        return 'qa';
    if (/\b(deploy|release|publish|push|ci|cd|pipeline)\b/.test(lower))
        return 'deployer';
    if (/\b(research|search|find|look up|investigate|analyze|survey)\b/.test(lower))
        return 'researcher';
    return 'coder';
}
export function getSkillHints(description) {
    const role = inferRole(description);
    const skill = loadSkill(role);
    if (!skill)
        return '';
    return `<skill_hints role="${role}">\n${skill}\n</skill_hints>`;
}
export function clearSkillCache() {
    skillCache.clear();
}
//# sourceMappingURL=skill-loader.js.map