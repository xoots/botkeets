const ROLE_PERMISSIONS = {
    'infra-admin': new Set(['can_execute', 'approve_pro_shard', 'update_budget_policy', 'update_task_budget']),
    'infra-service': new Set(['can_execute', 'approve_pro_shard', 'update_budget_policy', 'update_task_budget']),
    'keet-agent': new Set(['can_execute']),
    'viewer': new Set([]),
};
export function canRolePerform(role, action) {
    return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}
//# sourceMappingURL=rbac.js.map