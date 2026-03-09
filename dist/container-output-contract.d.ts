export declare const OUTPUT_START_MARKER = "---NANOCLAW_OUTPUT_START---";
export declare const OUTPUT_END_MARKER = "---NANOCLAW_OUTPUT_END---";
export interface ContainerOutputPayload {
    status: 'success' | 'error';
    result: string | null;
    newSessionId?: string;
    error?: string;
}
export type ContainerStdoutResolution = {
    kind: 'payload';
    payload: ContainerOutputPayload;
} | {
    kind: 'plain_text';
    text: string;
} | {
    kind: 'none';
};
export declare function extractContainerOutputPayload(output: string): ContainerOutputPayload | null;
export declare function resolveContainerStdout(output: string): ContainerStdoutResolution;
//# sourceMappingURL=container-output-contract.d.ts.map