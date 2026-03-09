import type { AssembledAnchor } from './memory-types.js';
import type { Mode } from './mode-manager.js';
export declare function getSessionAnchor(sessionId: string): string | null;
export interface MemorySessionContext {
    anchor: AssembledAnchor;
    projectId: string | null;
    canonScore: number;
    tierKey: string;
}
export declare function loadMemoryForTask(taskContent: string, mode: Mode, sessionId: string): Promise<MemorySessionContext | null>;
//# sourceMappingURL=memory-session.d.ts.map