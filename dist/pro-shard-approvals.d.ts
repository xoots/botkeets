interface ApprovalState {
    taskId: string;
    approved: boolean;
    decidedAt: string;
    note?: string;
}
export declare function approveProShards(taskId: string, note?: string): ApprovalState;
export declare function getProShardApproval(taskId: string): ApprovalState | null;
export declare function getPendingProShardApprovals(taskIds: string[]): string[];
export declare function emitProShardApprovedAlert(taskId: string, groupJid: string): string;
export {};
//# sourceMappingURL=pro-shard-approvals.d.ts.map