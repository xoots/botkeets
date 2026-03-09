export type ControlActionScope = 'global' | 'task' | 'policy' | 'approval';
export type ControlRuntimeId = 'keet';
export type ControlRuntimeMethod = 'setActiveModel' | 'updateBudgetPolicy' | 'approveShard' | 'refreshUi';
export interface LegacyControlActionRequest {
    format: 'legacy';
    action: string;
    scope: ControlActionScope;
    payload: Record<string, unknown>;
    requested_by?: string;
}
export interface RuntimeControlActionRequest {
    format: 'runtime';
    runtime_id: ControlRuntimeId;
    method: ControlRuntimeMethod;
    args: Record<string, unknown>;
    requested_by?: string;
}
export type ControlActionRequest = LegacyControlActionRequest | RuntimeControlActionRequest;
export interface ControlActionResult {
    ok: boolean;
    status?: string;
    mapped_runtime_calls: string[];
    warnings: string[];
    error_code?: string;
}
export interface ControlTaskView {
    task_id: string;
    path_used: 'keet' | 'copaw' | 'legacy' | 'fallback';
    state: string;
    budget_state: string;
    approval_state: string;
    fallback_reason?: string;
}
export declare function parseControlActionRequest(input: unknown): {
    ok: true;
    value: ControlActionRequest;
} | {
    ok: false;
    error_code: string;
};
//# sourceMappingURL=control-action-parser.d.ts.map