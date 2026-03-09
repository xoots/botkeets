import { type SignalEvent, type CanonWeights } from './memory-types.js';
export declare function cosineSimilarity(a: number[], b: number[]): number;
export declare function computeProjectCentroid(taskEmbeddings: number[][]): number[];
export declare function computeAlpha(taskEmbedding: number[], projectCentroid: number[]): number;
export declare function computeBeta(lastTouchedUnix: number, nowUnix?: number): number;
export declare function computeGamma(signals: Pick<SignalEvent, 'ts_unix'>[], nowUnix?: number): number;
export interface CanonScoreInput {
    taskEmbedding: number[];
    projectCentroid: number[];
    lastTouchedUnix: number;
    signals: Pick<SignalEvent, 'ts_unix'>[];
    nowUnix?: number;
    weights?: CanonWeights;
}
export interface CanonScoreResult {
    score: number;
    alpha: number;
    beta: number;
    gamma: number;
    weights: CanonWeights;
}
export declare function computeCanonScore(input: CanonScoreInput): CanonScoreResult;
//# sourceMappingURL=memory-canon-score.d.ts.map