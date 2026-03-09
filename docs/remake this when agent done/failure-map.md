# Failure Map

## Catch Blocks

| File | Function | What's Caught | Disposition |
|------|----------|---------------|-------------|
| container-runner.ts | runContainerPrompt (Promise handler) | Process spawn errors | Log + Return error message |
| container-runner.ts | runContainerForGroup (resumed task) | Task execution errors | Log + Fall back to direct container |
| container-runner.ts | runContainerForGroup (project plan mode) | Task execution errors | Log + Fall back to direct container |
| container-runner.ts | runContainerForGroup (Promise handler) | JSON parsing errors | Log + Continue |
| task-runner.ts | handleSearchStep | Search execution errors | Log + Return failure object |
| task-runner.ts | handleFetchStep | Fetch execution errors | Log + Return failure object |
| task-runner.ts | runStructured | Step execution errors | Log + Retry or trigger escape hatch |
| task-runner.ts | runAutonomous | Container execution errors | Log + Return failure result |
| task-runner.ts | runTask | Overall task execution errors | Log + Report error to user |
| group-queue.ts | runForGroup | Message processing errors | Log + Schedule retry |
| group-queue.ts | runTask | Task execution errors | Log + Continue |
| group-queue.ts | drainGroup/draining functions | Various execution errors | Log + Continue |
| project-planner.ts | callPlanner | Planning execution errors | Log + Return null (fallback) |
| project-planner.ts | verifyPlanViaOpenRouter | Plan verification errors | Log + Return null (continue without verification) |
| direct-runner.ts | callOllamaDirect | Ollama API errors | Throw error (caught by provider loop) |
| direct-runner.ts | callClaudeAPIDirect | Claude API errors | Throw error (caught by provider loop) |
| direct-runner.ts | callOpenRouterDirect | OpenRouter API errors | Throw error (caught by provider loop) |
| direct-runner.ts | callDashScopeDirect | DashScope API errors | Throw error (caught by provider loop) |
| direct-runner.ts | runDirectForGroup (routeMessage) | Routing errors | Log + Use fallback routing |
| direct-runner.ts | runDirectForGroup (webSearch) | Web search errors | Log + Continue without search |
| direct-runner.ts | runDirectForGroup (provider loop) | Individual provider errors | Log + Try next provider |
| direct-runner.ts | runDirectForGroup (main) | Unexpected errors | Log + Return false (fall back to container) |

## Timeouts

| File | Function | Duration | What Fires |
|------|----------|----------|------------|
| container-runner.ts | runContainerPrompt | CONTAINER_TIMEOUT (from config) | SIGTERM to process, then SIGKILL |
| container-runner.ts | runContainerForGroup | CONTAINER_TIMEOUT (from config) | SIGTERM to process, then SIGKILL |
| project-planner.ts | callPlanner | 20 seconds | AbortController.abort() |
| project-planner.ts | verifyPlanViaOpenRouter | 15 seconds | AbortController.abort() |
| direct-runner.ts | callOllamaDirect | 15 seconds | AbortSignal.timeout() |
| direct-runner.ts | callClaudeAPIDirect | 30 seconds | AbortSignal.timeout() |
| direct-runner.ts | callOpenRouterDirect | 30 seconds | AbortSignal.timeout() |
| direct-runner.ts | callDashScopeDirect | 30 seconds | AbortSignal.timeout() |
| group-queue.ts | scheduleRetry | Exponential backoff (BASE_RETRY_MS * 2^(retryCount-1)) | Re-enqueue message check |
| task-runner.ts | runStructured | 1000ms | Between retry attempts |

## Silent Failures

| File | Function | What Fails Silently | Severity |
|------|----------|---------------------|----------|
| container-runner.ts | runContainerPrompt (JSON parsing) | Failed JSON output parsing | MED |
| container-runner.ts | sendMessage | Failed message sending to container | LOW |
| container-runner.ts | closeStdin | Failed to signal container closure | LOW |
| group-queue.ts | enqueueMessageCheck | Messages beyond MAX_RETRIES are dropped | HIGH |
| project-planner.ts | callPlanner | Falls back to rule-based planner | MED |
| project-planner.ts | verifyPlanViaOpenRouter | Proceeds without verification | MED |
| direct-runner.ts | webSearch | Proceeds without search context | MED |
| direct-runner.ts | runDirectForGroup | Falls back to container when all providers fail | LOW |
| direct-runner.ts | provider loop | Individual provider failures | LOW |
| group-queue.ts | drainGroup | Max retry exceeded messages | HIGH |

## User-Visible Errors

| Error Type | Visibility |
|------------|------------|
| Task execution failures | Telegram (via ProgressReporter) |
| Container process errors | Logs only |
| Budget exceeded errors | Telegram (via ProgressReporter) |
| Classifier/routing errors | Logs only |
| Direct runner failures | Telegram (when all providers fail) |
| Queue processing errors | Logs only |
| Plan verification issues | Added to task progress (visible in task.md) |
| Web search failures | Logs only |
| Provider rate limiting | Logs only |
| Ollama unavailability | Logs only |

## Hardening Gaps

1. **container-runner.ts** - runContainerPrompt: JSON parsing failures are caught but only logged. The system could benefit from retrying or alerting on persistent parsing failures.

2. **container-runner.ts** - sendMessage/closeStdin: Failures are completely silent with no logging of the actual error. These should at least log the specific error for debugging.

3. **group-queue.ts** - enqueueMessageCheck: Messages dropped after MAX_RETRIES are not surfaced to users. Important messages might be lost without notification.

4. **project-planner.ts** - callPlanner: Falling back to rule-based planner for complex tasks might produce poor results without warning to the user.

5. **project-planner.ts** - verifyPlanViaOpenRouter: Verification failures proceed silently. If verification consistently fails, it should alert operators.

6. **direct-runner.ts** - webSearch: Search failures proceed silently. For business queries requiring data, this should be more explicit.

7. **direct-runner.ts** - provider loop: Individual provider failures don't alert users to potential service issues.

8. **task-runner.ts** - runStructured: Budget exceeded errors report to Telegram but could benefit from proactive alerts to operators.