import { getBudgetPolicy, updateBudgetPolicy } from '../../budget-policy.js';
export class PolicyApi {
    getPolicy() {
        return getBudgetPolicy();
    }
    updatePolicy(patch) {
        return updateBudgetPolicy(patch);
    }
}
//# sourceMappingURL=policy-api.js.map