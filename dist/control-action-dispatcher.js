import { runtimeRegistry } from './runtime-registry.js';
function resolveLegacyDispatchTarget(req) {
    if (req.action === 'set_active_model' && req.scope === 'policy') {
        return { method: 'setActiveModel', args: req.payload };
    }
    if (req.action === 'update_budget' && (req.scope === 'policy' || req.scope === 'global')) {
        return { method: 'updateBudgetPolicy', args: req.payload };
    }
    if (req.action === 'approve_pro_shard' && req.scope === 'approval') {
        return { method: 'approveShard', args: req.payload };
    }
    if (req.action === 'refresh_ui') {
        return { method: 'refreshUi', args: {} };
    }
    return null;
}
function resolveDispatchTarget(req) {
    if (req.format === 'runtime') {
        return {
            method: req.method,
            args: req.args,
        };
    }
    return resolveLegacyDispatchTarget(req);
}
export function dispatchControlAction(req, registry = runtimeRegistry) {
    const mappedRuntimeCalls = [];
    const warnings = [];
    const target = resolveDispatchTarget(req);
    if (!target) {
        return {
            ok: false,
            error_code: 'unsupported_action',
            mapped_runtime_calls: mappedRuntimeCalls,
            warnings,
        };
    }
    try {
        const keetRuntime = registry.resolve('keet').runtime;
        if (target.method === 'setActiveModel') {
            const providerId = String(target.args.provider_id || '');
            const model = String(target.args.model || '');
            if (!providerId || !model) {
                return { ok: false, error_code: 'invalid_payload', mapped_runtime_calls: mappedRuntimeCalls, warnings };
            }
            keetRuntime.setActiveModel({ provider_id: providerId, model });
            mappedRuntimeCalls.push('runtime_registry.keet.setActiveModel');
        }
        else if (target.method === 'updateBudgetPolicy') {
            keetRuntime.updateBudgetPolicy(target.args);
            mappedRuntimeCalls.push('runtime_registry.keet.updateBudgetPolicy');
        }
        else if (target.method === 'approveShard') {
            const taskId = String(target.args.task_id || '');
            const note = target.args.note === undefined ? undefined : String(target.args.note);
            if (!taskId) {
                return { ok: false, error_code: 'invalid_payload', mapped_runtime_calls: mappedRuntimeCalls, warnings };
            }
            const approvalResult = keetRuntime.approveShard(taskId, note);
            if (!approvalResult.approval.approved)
                warnings.push('No pending pro-shard approval found for task.');
            mappedRuntimeCalls.push('runtime_registry.keet.approveShard');
        }
        else {
            keetRuntime.refreshUi();
            warnings.push('refresh_ui is acknowledged but does not mutate runtime state.');
            mappedRuntimeCalls.push('runtime_registry.keet.refreshUi');
        }
        return {
            ok: true,
            status: 'applied',
            mapped_runtime_calls: mappedRuntimeCalls,
            warnings,
        };
    }
    catch (err) {
        return {
            ok: false,
            error_code: 'runtime_error',
            mapped_runtime_calls: mappedRuntimeCalls,
            warnings: [...warnings, err instanceof Error ? err.message : String(err)],
        };
    }
}
//# sourceMappingURL=control-action-dispatcher.js.map