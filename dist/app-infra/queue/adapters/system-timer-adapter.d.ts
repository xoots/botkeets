import { TimerAdapter } from '../contracts.js';
export declare class SystemTimerAdapter implements TimerAdapter {
    setTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout>;
    clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
//# sourceMappingURL=system-timer-adapter.d.ts.map