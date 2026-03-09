export type ToolResultClass = 'shell_output' | 'file_content' | 'web_content' | 'subagent_output' | 'tool_schema' | 'status' | 'generic';
export type TruncationStrategy = 'none' | 'head' | 'head_tail';
export interface ToolResultTruncationMeta {
    toolName: string;
    toolClass: ToolResultClass;
    strategy: TruncationStrategy;
    originalChars: number;
    shownChars: number;
    omittedChars: number;
    truncated: boolean;
    headChars: number;
    tailChars: number;
}
export interface TruncatedToolResult {
    content: string;
    meta: ToolResultTruncationMeta;
}
interface TruncationPolicy {
    toolClass: ToolResultClass;
    maxChars: number;
    strategy: Exclude<TruncationStrategy, 'none'>;
    headChars?: number;
    tailChars?: number;
}
export declare function getToolResultTruncationPolicy(toolName: string): TruncationPolicy;
export declare function truncateToolResult(toolName: string, rawContent: string): TruncatedToolResult;
export {};
