/**
 * Episodic Compression — compress completed micro-task results into session summary.
 * Append-only: never deletes raw signals or replaces existing summaries.
 * Fire-and-forget: runs via setImmediate, never blocks.
 */
export interface EpisodicResult {
    microId: string;
    title: string;
    success: boolean;
    summary: string;
}
export declare function compressEpisode(taskId: string, results: EpisodicResult[]): string;
export declare function appendEpisodeToProjectMemory(taskId: string, taskContent: string, results: EpisodicResult[]): void;
//# sourceMappingURL=episodic-compression.d.ts.map