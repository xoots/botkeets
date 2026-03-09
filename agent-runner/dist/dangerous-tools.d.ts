export type ToolPolicy = 'safe' | 'approval_only' | 'blocked';
export declare function getToolPolicy(toolName: string): ToolPolicy;
