export interface CogneeChunk {
    content: string;
    score: number;
}
export declare function searchCognee(query: string, projectId: string, topK?: number): Promise<CogneeChunk[]>;
//# sourceMappingURL=memory-cognee-search.d.ts.map