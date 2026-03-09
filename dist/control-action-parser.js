export function parseControlActionRequest(input) {
    if (!input || typeof input !== 'object')
        return { ok: false, error_code: 'invalid_payload' };
    const raw = input;
    const runtimeId = raw.runtime_id;
    const method = raw.method;
    const args = raw.args;
    const requestedBy = raw.requested_by;
    if ((runtimeId !== undefined || method !== undefined || args !== undefined) && typeof method === 'string') {
        if (runtimeId !== undefined && runtimeId !== 'keet')
            return { ok: false, error_code: 'invalid_runtime_id' };
        if (method !== 'setActiveModel' && method !== 'updateBudgetPolicy' && method !== 'approveShard' && method !== 'refreshUi') {
            return { ok: false, error_code: 'invalid_method' };
        }
        if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
            return { ok: false, error_code: 'invalid_args' };
        }
        if (requestedBy !== undefined && typeof requestedBy !== 'string') {
            return { ok: false, error_code: 'invalid_requested_by' };
        }
        return {
            ok: true,
            value: {
                format: 'runtime',
                runtime_id: 'keet',
                method,
                args: args ?? {},
                requested_by: requestedBy,
            },
        };
    }
    const action = raw.action;
    const scope = raw.scope;
    const payload = raw.payload;
    if (typeof action !== 'string' || !action.trim())
        return { ok: false, error_code: 'invalid_action' };
    if (scope !== 'global' && scope !== 'task' && scope !== 'policy' && scope !== 'approval') {
        return { ok: false, error_code: 'invalid_scope' };
    }
    if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
        return { ok: false, error_code: 'invalid_payload' };
    }
    if (requestedBy !== undefined && typeof requestedBy !== 'string') {
        return { ok: false, error_code: 'invalid_requested_by' };
    }
    return {
        ok: true,
        value: {
            format: 'legacy',
            action,
            scope,
            payload: payload ?? {},
            requested_by: requestedBy,
        },
    };
}
//# sourceMappingURL=control-action-parser.js.map