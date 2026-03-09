import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
function getMemoryDir(groupFolder) {
    const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
    return path.join(dataDir, 'memory', groupFolder);
}
export function readGroupMemory(groupFolder) {
    try {
        const file = path.join(getMemoryDir(groupFolder), 'MEMORY.md');
        if (!fs.existsSync(file))
            return '';
        return fs.readFileSync(file, 'utf-8');
    }
    catch (err) {
        logger.warn({ err, groupFolder }, 'group-memory: failed to read MEMORY.md');
        return '';
    }
}
export function readRecentJournals(groupFolder, days = 3) {
    try {
        const dir = getMemoryDir(groupFolder);
        if (!fs.existsSync(dir))
            return '';
        const today = new Date();
        const parts = [];
        for (let i = 0; i < days; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const file = path.join(dir, `${dateStr}.md`);
            if (fs.existsSync(file)) {
                parts.push(`### ${dateStr}\n${fs.readFileSync(file, 'utf-8')}`);
            }
        }
        return parts.join('\n\n');
    }
    catch (err) {
        logger.warn({ err, groupFolder }, 'group-memory: failed to read journals');
        return '';
    }
}
export function appendToJournal(groupFolder, taskSummary, facts) {
    try {
        const dir = getMemoryDir(groupFolder);
        fs.mkdirSync(dir, { recursive: true });
        const dateStr = new Date().toISOString().slice(0, 10);
        const file = path.join(dir, `${dateStr}.md`);
        const timestamp = new Date().toISOString().slice(11, 19);
        const entry = `\n#### ${timestamp}\n**Task:** ${taskSummary}\n${facts}\n`;
        fs.appendFileSync(file, entry, 'utf-8');
    }
    catch (err) {
        logger.warn({ err, groupFolder }, 'group-memory: failed to append journal');
    }
}
export function mergeIntoMemory(groupFolder, newFacts) {
    try {
        const dir = getMemoryDir(groupFolder);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'MEMORY.md');
        const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
        const existingBullets = existing.split('\n').filter(l => l.startsWith('- '));
        const newBullets = newFacts.split('\n').filter(l => l.startsWith('- '));
        const seen = new Set(existingBullets);
        for (const b of newBullets) {
            if (!seen.has(b)) {
                existingBullets.push(b);
                seen.add(b);
            }
        }
        const kept = existingBullets.slice(-50);
        const content = `# Group Memory\n\n${kept.join('\n')}\n`;
        fs.writeFileSync(file, content, 'utf-8');
    }
    catch (err) {
        logger.warn({ err, groupFolder }, 'group-memory: failed to merge memory');
    }
}
export function assembleGroupMemoryAnchor(groupFolder) {
    try {
        const memory = readGroupMemory(groupFolder);
        const journals = readRecentJournals(groupFolder);
        if (!memory && !journals)
            return '';
        const parts = [];
        if (memory) {
            parts.push(`## Group Memory\n${memory.slice(0, 800)}`);
        }
        if (journals) {
            parts.push(`## Recent Activity\n${journals.slice(0, 600)}`);
        }
        return parts.join('\n\n');
    }
    catch (err) {
        logger.warn({ err, groupFolder }, 'group-memory: failed to assemble anchor');
        return '';
    }
}
//# sourceMappingURL=group-memory.js.map