import { evaluateBudget, getOrInitTaskSpend, recordSpend } from '../../budget-policy.js';
export class BudgetLedgerService {
    canExecute(args) {
        return evaluateBudget(args);
    }
    recordApprovedSpend(args) {
        return recordSpend(args);
    }
    getTaskSpend(taskId, mode) {
        return getOrInitTaskSpend(taskId, mode);
    }
}
//# sourceMappingURL=budget-ledger-service.js.map