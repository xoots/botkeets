export type ToolPolicy = 'safe' | 'approval_only' | 'blocked';

interface ToolPolicyRule {
  pattern: string;
  policy: ToolPolicy;
}

const TOOL_POLICY_RULES: ToolPolicyRule[] = [
  { pattern: 'Bash', policy: 'approval_only' },
  { pattern: 'Read', policy: 'safe' },
  { pattern: 'Write', policy: 'approval_only' },
  { pattern: 'Edit', policy: 'approval_only' },
  { pattern: 'Glob', policy: 'safe' },
  { pattern: 'Grep', policy: 'safe' },
  { pattern: 'WebSearch', policy: 'safe' },
  { pattern: 'WebFetch', policy: 'safe' },
  { pattern: 'Task', policy: 'approval_only' },
  { pattern: 'TaskOutput', policy: 'safe' },
  { pattern: 'TaskStop', policy: 'safe' },
  { pattern: 'TeamCreate', policy: 'approval_only' },
  { pattern: 'TeamDelete', policy: 'approval_only' },
  { pattern: 'SendMessage', policy: 'safe' },
  { pattern: 'TodoWrite', policy: 'safe' },
  { pattern: 'ToolSearch', policy: 'safe' },
  { pattern: 'Skill', policy: 'safe' },
  { pattern: 'NotebookEdit', policy: 'approval_only' },
  { pattern: 'mcp__nanoclaw__send_message', policy: 'safe' },
  { pattern: 'mcp__nanoclaw__list_tasks', policy: 'safe' },
  { pattern: 'mcp__nanoclaw__schedule_task', policy: 'approval_only' },
  { pattern: 'mcp__nanoclaw__pause_task', policy: 'approval_only' },
  { pattern: 'mcp__nanoclaw__resume_task', policy: 'approval_only' },
  { pattern: 'mcp__nanoclaw__cancel_task', policy: 'approval_only' },
  { pattern: 'mcp__nanoclaw__register_group', policy: 'blocked' },
  { pattern: 'mcp__nanoclaw__*', policy: 'approval_only' },
  { pattern: 'mcp__*', policy: 'approval_only' },
  { pattern: 'bash', policy: 'approval_only' },
  { pattern: 'read_file', policy: 'safe' },
  { pattern: 'write_file', policy: 'approval_only' },
  { pattern: 'edit_file', policy: 'approval_only' },
  { pattern: 'glob', policy: 'safe' },
  { pattern: 'send_message', policy: 'safe' },
  { pattern: 'browse_url', policy: 'safe' },
  { pattern: 'schedule_task', policy: 'approval_only' },
  { pattern: 'spawn_subagent', policy: 'approval_only' },
  { pattern: 'read_skill_manual', policy: 'safe' },
  { pattern: 'get_tool_definition', policy: 'safe' },
];

function matchesPattern(toolName: string, pattern: string): boolean {
  if (!pattern.includes('*')) return toolName === pattern;
  return toolName.startsWith(pattern.slice(0, -1));
}

export function getToolPolicy(toolName: string): ToolPolicy {
  const exactMatch = TOOL_POLICY_RULES.find((rule) => !rule.pattern.includes('*') && rule.pattern === toolName);
  if (exactMatch) return exactMatch.policy;

  const wildcardMatches = TOOL_POLICY_RULES
    .filter((rule) => rule.pattern.includes('*') && matchesPattern(toolName, rule.pattern))
    .sort((left, right) => right.pattern.length - left.pattern.length);

  return wildcardMatches[0]?.policy ?? 'blocked';
}
