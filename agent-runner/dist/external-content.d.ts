export interface ExternalContentWrapOptions {
    source: string;
    content: string;
    url?: string;
    maxChars?: number;
}
export declare function sanitizeExternalContentText(content: string): string;
export declare function wrapExternalContent(options: ExternalContentWrapOptions): string;
