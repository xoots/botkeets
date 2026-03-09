import fs from 'fs';
import path from 'path';
const FILE = path.join(process.cwd(), 'logs', 'pro-shard-approvals.json');
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
export function approveProShards(taskId, note) {
    const all = readAll();
    all[taskId] = {
        taskId,
        approved: true,
        decidedAt: new Date().toISOString(),
        note,
    };
    writeAll(all);
    return all[taskId];
}
export function getProShardApproval(taskId) {
    const all = readAll();
    return all[taskId] ?? null;
}
export function getPendingProShardApprovals(taskIds) {
    const all = readAll();
    return taskIds.filter((taskId) => !all[taskId]?.approved);
}
export function emitProShardApprovedAlert(taskId, groupJid) {
    const alertDir = path.join(process.cwd(), 'ipc', '_alerts');
    fs.mkdirSync(alertDir, { recursive: true });
    const filePath = path.join(alertDir, `pro-shard-approved-${taskId}-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ type: 'pro_shard_approved', taskId, groupJid, ts: Date.now() }, null, 2), 'utf-8');
    return filePath;
}
//# sourceMappingURL=pro-shard-approvals.js.map