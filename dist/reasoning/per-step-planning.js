export function buildExecutionOrder(steps) {
    const done = new Set();
    const result = [];
    const queue = [...steps];
    let passes = 0;
    while (queue.length > 0 && passes < steps.length * 2) {
        passes++;
        for (let i = queue.length - 1; i >= 0; i--) {
            const step = queue[i];
            if (step.dependsOn.every((dep) => done.has(dep))) {
                result.push(step);
                done.add(step.step);
                queue.splice(i, 1);
            }
        }
    }
    result.push(...queue);
    return result;
}
//# sourceMappingURL=per-step-planning.js.map