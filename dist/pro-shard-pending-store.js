import fs from 'fs';
import path from 'path';
const FILE = path.join(process.cwd(), 'logs', 'pro-shard-pending.json');
function readAll() {
    try {
        return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function writeAll(data) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}
export function savePendingProShardTask(task) {
    const all = readAll();
    all[task.taskId] = task;
    writeAll(all);
}
export function getPendingProShardTask(taskId) {
    const all = readAll();
    return all[taskId] ?? null;
}
export function findPendingProShardTaskByGroup(groupJid) {
    const all = readAll();
    return Object.values(all).find((t) => t.groupJid === groupJid) ?? null;
}
export function getAllPendingProShardTasks() {
    return Object.values(readAll()).sort((a, b) => b.createdAt - a.createdAt);
}
export function clearPendingProShardTask(taskId) {
    const all = readAll();
    delete all[taskId];
    writeAll(all);
}
//# sourceMappingURL=pro-shard-pending-store.js.map