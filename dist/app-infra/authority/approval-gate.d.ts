export declare class ApprovalGate {
    isProApproved(taskId: string): boolean;
    approve(taskId: string, note?: string): {
        approval: {
            taskId: string;
            approved: boolean;
            decidedAt: string;
            note?: string;
        };
        alert_file: string | null;
    };
}
//# sourceMappingURL=approval-gate.d.ts.map