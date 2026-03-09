type FactorySummary = {
    decisions: number;
    commits: number;
    providers: number;
    updatedFiles: string[];
};
export interface RunContextFactoryOptions {
    rootDir?: string;
    commitLimit?: number;
    now?: Date;
}
export declare function runContextFactory(options?: RunContextFactoryOptions): FactorySummary;
export {};
//# sourceMappingURL=context-factory.d.ts.map