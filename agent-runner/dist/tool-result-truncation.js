const DEFAULT_POLICY = {
    toolClass: 'generic',
    maxChars: 6_000,
    strategy: 'head_tail',
    headChars: 3_500,
    tailChars: 2_000,
};
const TOOL_POLICIES = {
    bash: {
        toolClass: 'shell_output',
        maxChars: 8_000,
        strategy: 'head_tail',
        headChars: 4_500,
        tailChars: 2_500,
    },
    glob: {
        toolClass: 'shell_output',
        maxChars: 4_000,
        strategy: 'head',
    },
    read_file: {
        toolClass: 'file_content',
        maxChars: 12_000,
        strategy: 'head_tail',
        headChars: 7_000,
        tailChars: 3_500,
    },
    read_skill_manual: {
        toolClass: 'file_content',
        maxChars: 10_000,
        strategy: 'head_tail',
        headChars: 6_000,
        tailChars: 2_500,
    },
    browse_url: {
        toolClass: 'web_content',
        maxChars: 8_000,
        strategy: 'head_tail',
        headChars: 4_500,
        tailChars: 2_000,
    },
    spawn_subagent: {
        toolClass: 'subagent_output',
        maxChars: 8_000,
        strategy: 'head_tail',
        headChars: 4_500,
        tailChars: 2_500,
    },
    get_tool_definition: {
        toolClass: 'tool_schema',
        maxChars: 4_000,
        strategy: 'head',
    },
    write_file: {
        toolClass: 'status',
        maxChars: 2_000,
        strategy: 'head',
    },
    edit_file: {
        toolClass: 'status',
        maxChars: 2_000,
        strategy: 'head',
    },
    send_message: {
        toolClass: 'status',
        maxChars: 2_000,
        strategy: 'head',
    },
    schedule_task: {
        toolClass: 'status',
        maxChars: 2_000,
        strategy: 'head',
    },
};
export function getToolResultTruncationPolicy(toolName) {
    return TOOL_POLICIES[toolName] ?? DEFAULT_POLICY;
}
export function truncateToolResult(toolName, rawContent) {
    const normalized = rawContent.replace(/\r\n?/g, '\n');
    const originalChars = normalized.length;
    const policy = getToolResultTruncationPolicy(toolName);
    if (originalChars <= policy.maxChars) {
        return {
            content: normalized,
            meta: {
                toolName,
                toolClass: policy.toolClass,
                strategy: 'none',
                originalChars,
                shownChars: originalChars,
                omittedChars: 0,
                truncated: false,
                headChars: originalChars,
                tailChars: 0,
            },
        };
    }
    if (policy.strategy === 'head') {
        const shown = normalized.slice(0, policy.maxChars);
        return {
            content: shown,
            meta: {
                toolName,
                toolClass: policy.toolClass,
                strategy: 'head',
                originalChars,
                shownChars: shown.length,
                omittedChars: Math.max(0, originalChars - shown.length),
                truncated: true,
                headChars: shown.length,
                tailChars: 0,
            },
        };
    }
    const headChars = Math.min(policy.headChars ?? Math.ceil(policy.maxChars * 0.6), originalChars);
    const tailBudget = Math.min(policy.tailChars ?? Math.ceil(policy.maxChars * 0.3), Math.max(0, originalChars - headChars));
    const head = normalized.slice(0, headChars);
    const tail = normalized.slice(originalChars - tailBudget);
    const omissionMarker = [
        '',
        `[... ${Math.max(0, originalChars - head.length - tail.length)} chars omitted from ${toolName} output ...]`,
        '',
    ].join('\n');
    const content = head + omissionMarker + tail;
    return {
        content,
        meta: {
            toolName,
            toolClass: policy.toolClass,
            strategy: 'head_tail',
            originalChars,
            shownChars: content.length,
            omittedChars: Math.max(0, originalChars - head.length - tail.length),
            truncated: true,
            headChars: head.length,
            tailChars: tail.length,
        },
    };
}
