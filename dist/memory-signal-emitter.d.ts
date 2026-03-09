import type { SignalEvent, SignalType } from './memory-types.js';
export declare function emitSignal(projectId: string, signalType: SignalType, weight: number, taskId?: string, embeddingDistance?: number, parentId?: string): void;
export declare function readSignals(projectId: string): SignalEvent[];
//# sourceMappingURL=memory-signal-emitter.d.ts.map