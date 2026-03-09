export interface PreTaskAdjustment {
    hints: string[];
    add_qa_step: boolean;
    project_id: string | null;
    failure_count_7d: number;
    success_count_7d: number;
}
export declare function scanForAdjustments(taskContent: string): PreTaskAdjustment;
export declare function formatAdjustmentHints(adjustment: PreTaskAdjustment): string;
//# sourceMappingURL=pre-task-reflection.d.ts.map