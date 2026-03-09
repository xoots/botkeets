export class SystemTimerAdapter {
    setTimeout(fn, delayMs) {
        return setTimeout(fn, delayMs);
    }
    clearTimeout(timer) {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=system-timer-adapter.js.map