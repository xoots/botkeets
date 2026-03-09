import fs from 'fs';
import path from 'path';
let cachedIndex = null;
let cacheTs = 0;
const CACHE_TTL_MS = 60_000;
function getIndexPath() {
    const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
    return path.join(dataDir, 'memory-project-index.json');
}
function loadIndex() {
    const now = Date.now();
    if (cachedIndex && now - cacheTs < CACHE_TTL_MS)
        return cachedIndex;
    try {
        const file = getIndexPath();
        if (!fs.existsSync(file))
            return { projects: [] };
        cachedIndex = JSON.parse(fs.readFileSync(file, 'utf-8'));
        cacheTs = now;
        return cachedIndex;
    }
    catch {
        return { projects: [] };
    }
}
export function resolveProjectIdFromContent(content) {
    const index = loadIndex();
    if (index.projects.length === 0)
        return null;
    const lower = content.toLowerCase();
    for (const project of index.projects) {
        if (project.keywords.some(k => lower.includes(k)))
            return project.project_id;
    }
    return null;
}
export function invalidateProjectIndexCache() {
    cachedIndex = null;
    cacheTs = 0;
}
export function autoRegisterProject(groupFolder, taskContent) {
    const index = loadIndex();
    if (index.projects.some(p => p.project_id === groupFolder))
        return groupFolder;
    const folderWords = groupFolder.split(/[_\-]/).filter(w => w.length > 2);
    const contentWords = taskContent
        ? taskContent.split(/\s+/).filter(w => w.length > 3).slice(0, 3)
        : [];
    const keywords = [...new Set([...folderWords, ...contentWords])].map(w => w.toLowerCase());
    index.projects.push({ project_id: groupFolder, keywords });
    try {
        fs.writeFileSync(getIndexPath(), JSON.stringify(index, null, 2), 'utf-8');
    }
    catch {
        // never throw — disk write failure is non-fatal
    }
    invalidateProjectIndexCache();
    return groupFolder;
}
//# sourceMappingURL=memory-project-resolver.js.map