# NanoClaw Model Map

This document maps every model call in the system, showing what calls what, when, and why.

## Model Calls

| File | Function | Model | Input Type | Output Destination |
|------|----------|-------|------------|-------------------|
| classifier/main.py | classify_text | BAAI/bge-small-en-v1.5 (local) or text-embedding-3-small (api) | Text string | Route classification |
| classifier/main.py | classify_text | None (cosine similarity) | Embedding vectors | Route classification |
| AGENT/src/task-classifier.ts | classifyViaSidecar | Semantic router sidecar | Text string | ClassifierResult object |
| AGENT/src/task-classifier.ts | classifyViaOllama | qwen3:8b | Text string with system prompt | ClassifierResult object |
| AGENT/src/task-classifier.ts | ruleBasedClassify | None (regex rules) | Text string | ClassifierResult object |
| AGENT/agent-runner/src/index.ts | runQuery | Claude SDK | AsyncIterable of messages | ContainerOutput stream |
| AGENT/agent-runner/src/openai-compat-runner.ts | runQuery | Configurable via RunnerConfig | Messages with system prompt | ContainerOutput stream |
| AGENT/agent-runner/src/openai-compat-runner.ts | executeTool (spawn_subagent) | Inherits from parent | Sub-agent prompt | String result |
| AGENT/src/container-runner.ts | runContainerPrompt | Claude SDK | Single prompt | String result |
| AGENT/src/project-planner.ts | callPlanner | qwen3:8b | Task description with system prompt | RawPlan object |
| AGENT/src/project-planner.ts | verifyPlanViaOpenRouter | openrouter/auto | Plan JSON with system prompt | VerifyResult object |
| AGENT/src/project-planner.ts | ruleBasedPlan | None (static generation) | Task description | RawPlan object |
| AGENT/src/direct-runner.ts | callOllamaDirect | Configurable via model param | System prompt + user message | String response |
| AGENT/src/direct-runner.ts | callClaudeAPIDirect | Claude API model | System prompt + user message | String response |
| AGENT/src/direct-runner.ts | callOpenRouterDirect | Configurable via model param | System prompt + user message | String response |
| AGENT/src/direct-runner.ts | callDashScopeDirect | Configurable via model param | System prompt + user message | String response |
| AGENT/src/context-manager.ts | compressMessages | qwen3:8b | Conversation history | Compressed message array |
| AGENT/src/web-search.ts | braveSearch | Brave Search API | Query string | SearchResponse object |
| AGENT/src/web-search.ts | perplexitySearch | sonar-pro | Query string | SearchResponse object |

## Existing Chain Links

1. **Classification Chain**:
   - Sidecar classifier (fastembed/OpenAI embedding) → qwen3:8b classifier → rule-based fallback
   - Output: Task classification driving mode selection

2. **Planning Chain**:
   - qwen3:8b planner → openrouter/auto verifier → task execution
   - Output: Verified plan for task execution

3. **Execution Chain**:
   - Claude SDK (container) ↔ tool execution ↔ sub-agent spawning
   - Output: Task completion with intermediate tool results

4. **Compression Chain**:
   - Context overflow detection → qwen3:8b compression → context-limited model call
   - Output: Maintained context within model limits

5. **Search Chain**:
   - Mode-based selection → Brave Search or Perplexity API → context injection
   - Output: Enhanced context for model responses

## Related Documentation

For detailed information about model routing, fallback mechanisms, and context management, see:
- [Routing and Fallback Map](routing-fallback-map.md) - Complete routing strategies and fallback scenarios
- [Model and Mode Coverage](model-mode-coverage.md) - Comprehensive model capabilities matrix
- [Token Flow Map](token-flow-map.md) - Complete token lifecycle documentation

## Prompt Shaping

### Context Management
- **Token Estimation**: 1 token ≈ 4 characters
- **Context Limits**: Model-specific limits (Claude: 200k, qwen3:8b: 8k, etc.)
- **Budget Threshold**: 40% usage triggers compression
- **Compression Strategy**: Keep last 5 turns uncompressed, summarize older turns

### System Prompts
- **Classifier**: Structured JSON output requirement with schema definition
- **Planner**: Static system prompt with dynamic user message injection
- **Direct Runner**: Intent-specific prompts (social, business, etc.)
- **Container Runner**: Comprehensive system context with harness reminders

### Input Processing
- **Message Formatting**: combineMessages function aggregates chat history
- **Web Context Injection**: Search results prefixed to user messages
- **Tool Result Integration**: Harness reminders appended to maintain constraints
- **Credential Filtering**: Vault keys selectively exposed to planning/execution

### Output Processing
- **Response Formatting**: formatOutbound function cleans up responses
- **Progress Reporting**: ProgressReporter class provides execution updates
- **Result Streaming**: OUTPUT_START/END markers for container communication

## Gaps

1. **Missing Chain Link**: No direct feedback loop from execution results to planning
2. **Limited Self-Improvement**: Classification results logged but not used to improve routing
3. **No Cross-Task Learning**: Plans don't benefit from outcomes of previous similar tasks
4. **Static Compression**: Compression strategy doesn't adapt based on task type or model performance
5. **Verification Isolation**: Plan verification is separate from execution context