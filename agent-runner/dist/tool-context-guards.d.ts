export declare const TOOL_RESULT_CHAR_LIMITS: {
    readonly bash: 8000;
    readonly read_file: 12000;
    readonly write_file: 2000;
    readonly edit_file: 2000;
    readonly glob: 4000;
    readonly browse_url: 8000;
    readonly spawn_subagent: 8000;
    readonly get_tool_definition: 4000;
    readonly send_message: 2000;
    readonly schedule_task: 2000;
};
export declare function sanitizeContextText(text: string): string;
export declare function wrapExternalContent(args: {
    source: 'url_prefetch' | 'browse_url';
    label: string;
    text: string;
    maxChars: number;
}): string;
export declare function wrapToolResultForContext(args: {
    toolName: string;
    text: string;
}): string;
