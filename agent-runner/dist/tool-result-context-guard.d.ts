import type { ChatCompletionToolMessageParam } from 'openai/resources/chat/completions';
import { type ToolResultTruncationMeta } from './tool-result-truncation.js';
export interface GuardedToolResult {
    content: string;
    meta: ToolResultTruncationMeta;
}
export declare function guardToolResultForContext(toolName: string, rawResult: string): GuardedToolResult;
export declare function buildToolResultContextMessage(toolCallId: string, toolName: string, rawResult: string): ChatCompletionToolMessageParam;
