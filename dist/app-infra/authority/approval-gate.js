import { getPendingProShardTask } from '../../pro-shard-pending-store.js';
import { approveProShards, emitProShardApprovedAlert, getProShardApproval } from '../../pro-shard-approvals.js';
export class ApprovalGate {
    isProApproved(taskId) {
        return Boolean(getProShardApproval(taskId)?.approved);
    }
    approve(taskId, note) {
        const approval = approveProShards(taskId, note);
        const pending = getPendingProShardTask(taskId);
        return {
            approval,
            alert_file: pending?.groupJid ? emitProShardApprovedAlert(taskId, pending.groupJid) : null,
        };
    }
}
//# sourceMappingURL=approval-gate.js.map