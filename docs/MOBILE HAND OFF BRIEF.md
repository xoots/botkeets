# MOBILE HAND OFF BRIEF

Code-verified handoff for the mobile integration team.

Audit basis:
- Verified against source in `src/`, `agent-runner/`, and `classifier/`
- Existing docs were not treated as source of truth
- Snapshot date: 2026-03-08

## 1. Executive state

Keets is currently a Node/TypeScript orchestration runtime with:
- chat ingress from Telegram and Discord
- a local-or-sidecar classifier stage
- a direct-response lane for low-complexity work
- a planning + container-execution lane for code/complex work
- optional drip-feed step execution for multi-step plans
- persistent state split across SQLite plus a few JSON sidecars

For the mobile work you described, the most important reality is:
- classifier integration already has a clean HTTP seam
- micro-task decomposition has a local model seam, but is not wired into the main execution path today
- drip-feed execution does not currently own a dedicated worker-model abstraction; it delegates each micro-step to the same container execution callback used by the main task runner
- increased parallelization and thermal scheduling are not implemented yet; there is only limited global queue concurrency and some unused per-group override plumbing

## 2. Runtime topology as implemented

Primary entrypoint:
- `src/index.ts`

Core flow:
1. Boot channels, DB, control server, monitor loop, container runtime
2. Poll DB for new inbound messages
3. Queue group execution through `PlatformQueueService`
4. Run intake/classification
5. Either answer directly or enter planning/execution

Main execution modules:
- ingress/bootstrap: `src/index.ts`
- queueing: `src/app-infra/queue/platform-queue-service.ts`
- intake: `src/intake-policy.ts`
- routing: `src/mode-router.ts`, `src/execution-routing.ts`
- direct lane: `src/direct-runner.ts`
- planning: `src/project-planner.ts`
- approval/clarification: `src/approval-policy.ts`, `src/clarification-store.ts`
- execution lifecycle: `src/execution-lifecycle.ts`
- structured/autonomous task runner: `src/task-runner.ts`
- drip-feed executor: `src/drip-feed-executor.ts`
- container bridge: `src/container-runner.ts`
- provider/runtime selection: `src/provider-registry.ts`, `src/keet-provider-config.ts`, `src/runtime-resolver.ts`

## 3. End-to-end message flow

### Ingress and queueing

`src/index.ts` runs a polling loop over SQLite-backed messages, groups them by chat, and enqueues work with `queue.requestExecution(chatJid)`.

Queue implementation:
- `PlatformQueueService` enforces global concurrency with `MAX_CONCURRENT_CONTAINERS`
- current default is `2` in `src/config.ts`
- queue state is per group, but concurrency budgeting is global, not thermal/device-aware
- retries and queue-drop alerts exist

Important current limitation:
- per-group concurrency overrides exist in `src/group-queue.ts`
- `!parallel` / `!parallel3` are parsed and stored
- `getGroupConcurrency()` is not used by the queue service
- result: parallel override plumbing exists, but is not actually applied to execution scheduling

### Intake and classification

`src/intake-policy.ts` does:
1. resume any pending pro-shard task
2. resume clarification/approval if pending
3. load new messages
4. classify combined content with `classifyTask()`
5. send low-complexity work to direct lane
6. send the rest to planning/container execution

Direct path is chosen when:
- classifier complexity is `low`, or
- task type is `social`, or
- task type is `chat`

Everything else is treated as planning/container work.

## 4. Classifier state

Primary code:
- `src/task-classifier.ts`
- sidecar service: `classifier/main.py`, `classifier/routes.py`

Actual classifier order:
1. HTTP sidecar at `CLASSIFIER_SIDECAR_URL` (default `http://localhost:8765`)
2. local Ollama chat call via `classifyViaOllama()`
3. regex/rule fallback

Classifier output contract:
- `task_type`: `social | chat | business | research | code | complex`
- `complexity`: `low | medium | high`
- `quality_stakes`: `low | medium | high`
- `recommended_mode`: `eco | standard | pro`
- optional `agent_type`, `model_tier`, `project_id`

Current sidecar behavior:
- FastAPI service
- cosine-similarity semantic router over prebuilt route utterances
- local mode uses `FastEmbedEncoder` / BAAI `bge-small-en-v1.5`
- API mode uses OpenAI embeddings
- narrow HTTP contract:
  - `GET /health`
  - `POST /classify { text }`
  - `GET /routes`

Mobile relevance:
- this is the cleanest mobile insertion seam in the repo
- mobile can replace or proxy the sidecar contract without changing the Node orchestration layer
- if mobile classifier is on-device, matching the `/classify` response shape is enough to slot in

Classifier side effects:
- emits memory signals asynchronously
- may generate and store embeddings asynchronously through DashScope

## 5. Direct lane state

Primary code:
- `src/direct-runner.ts`

Direct lane handles non-container work only.

Important code-truth note:
- comments still describe local-first direct chat models like `nanbeige` and `smollm`
- actual runtime path is provider-plan driven via `routeMessage()`
- in practice, direct responses often resolve to DashScope or DeepSeek, not Ollama

Direct lane behavior:
- gets `ProviderPlan` from `mode-router`
- optionally injects web search results
- selects CoPaw lane or KEET direct lane
- calls provider directly without spawning container
- falls back across providers
- only escalates to container if task requires it or providers exhaust for non-chat work

Lane selection:
- `src/execution-routing.ts`
- CoPaw only for lighter, non-container, non-pro tasks
- KEET execution lane for code, complex, high-complexity, or high-stakes business work

## 6. Planning state

Primary code:
- `src/project-planner.ts`

Planner output:
- `PlanResult`
- ordered `subtasks`
- optional clarifications
- required credentials
- `needsContainer`
- `needs_decomposition`
- plan markdown written to workspace `task.md`

Planner provider defaults:
- `eco`: DashScope `qwen3.5-plus`
- `standard`: DeepSeek `deepseek-reasoner`
- `pro`: Claude `claude-sonnet-4-6`

Important code-truth note:
- planner comments still say local `qwen3:8b`
- actual default planner path is not local unless explicitly invoked with provider `ollama`

Plan verification:
- optional second pass through DashScope `qwen-plus`
- used to catch ordering/tool/credential issues

Clarifications:
- stored in `logs/clarification-pending.json`
- resumed by the next message or `!go`

Plan UI state:
- Telegram can collect `orchestrator`, `worker`, and `budgetCap`
- stored in `clarification-store`
- current scan found storage and UI plumbing, but no execution-time application of these selections

## 7. Container execution state

Primary code:
- `src/container-runner.ts`
- `src/task-runner.ts`
- `src/runtime-resolver.ts`
- `src/container-runtime-manager.ts`

Container orchestration path:
1. intake decides planning is needed
2. planner creates `PlanResult`
3. approval/clarification gate may pause
4. execution lifecycle loads memory and chooses run path
5. `runTask()` or `dripFeedExecute()` calls back into `runContainerPrompt()`
6. `runContainerPrompt()` selects runner script and spawns container runtime

Container runtimes:
- Apple container runtime
- Docker runtime
- selected by `CONTAINER_RUNTIME_TYPE`

Session state:
- session handles and provider-specific session IDs are persisted in SQLite `sessions`
- scoped `.claude` settings directory is mounted into the container

Important code-truth issue:
- `runContainerPrompt()` defines `releaseLease()` recursively instead of calling `platformContextManager.releaseSessionContext(...)`
- current source would recurse on first release attempt
- this should be treated as a real runtime bug until disproven by a different built artifact

## 8. Worker runners as actually present

Source files under `agent-runner/src`:
- `index.ts` -> Claude Agent SDK runner
- `index-openrouter.ts` -> OpenAI-compatible runner
- `index-qwen.ts` -> DashScope/Qwen OpenAI-compatible runner
- `openai-compat-runner.ts` -> shared base

Observed mismatches:
- `src/runtime-resolver.ts` expects:
  - `index.js`
  - `index-openrouter.js`
  - `index-dashscope.js`
  - `index-ollama.js`
- source tree only contains:
  - `index.ts`
  - `index-openrouter.ts`
  - `index-qwen.ts`
- no `index-dashscope.ts`
- no `index-ollama.ts`

Implication:
- DashScope and Ollama runner naming does not line up cleanly in source
- mobile integration should not assume the runner-script mapping is correct as-is
- verify against the built image before relying on any runner switch logic

Additional mismatch in `agent-runner/src/index-qwen.ts`:
- secret keys use `Dashscope_API_KEY` and `Dashscope_BASE_URL`
- main app config and runtime use `DASHSCOPE_API_KEY` and `DASHSCOPE_BASE_URL`
- this is another naming inconsistency the mobile team should not inherit

## 9. Drip-feed state

Primary code:
- `src/drip-feed-executor.ts`
- `src/staging-cache.ts`
- `src/drip-feed-schemas.ts`
- `src/deterministic-executor.ts`
- `src/step-router.ts`

Activation:
- `executeAndFinalize()` auto-enables drip-feed when:
  - subtasks >= 3
  - execution mode is `structured`
  - `!nodrip` is not present
- `!drip` forces it on

Current behavior:
- converts plan subtasks into micro-tasks
- stages them in `StagingCache`
- executes sequentially
- tries deterministic execution first
- otherwise calls `containerExecute()` for each micro
- retries up to 3 times
- uses failure reflection between retries
- can append dynamic follow-up micro-tasks if output contains markers like `TODO:` or `FOLLOW-UP:`

Important current limitations:
- despite the name, drip-feed is not parallel
- no thermal scheduling exists
- no dedicated mobile-worker abstraction exists here yet
- the worker model is whatever `containerExecute()` and step routing resolve to

Mobile relevance:
- the main seam for mobile worker support in drip-feed is not `dripFeedExecute()` itself
- it is the combination of:
  - `decideStepRouting()`
  - `runContainerPrompt()`
  - runner/provider mapping

## 10. Micro-task decomposition state

Primary code:
- `src/micro-task-decomposer.ts`

Behavior:
- local Ollama call
- default model `DECOMPOSER_MODEL || qwen3:8b`
- returns up to 20 atomic `MicroTask`s
- assigns `execution_hint` via deterministic-executor inference

Critical code-truth note:
- current scan found the function definition, but no production call sites using `decomposeTask()`
- the main execution path uses planner subtasks directly and drip-feed converts those subtasks into micros
- result: the micro-task decomposer exists as a seam, but it is not live in the primary orchestration path today

Mobile relevance:
- if the goal is to add mobile local models to "microtask functions", this module is the obvious candidate
- but wiring it into the live path is separate work

## 11. Step routing and provider selection state

Primary code:
- `src/mode-router.ts`
- `src/provider-registry.ts`
- `src/keet-provider-config.ts`
- `src/runtime-resolver.ts`
- `src/step-router.ts`

There are multiple provider/model truth layers:

### A. Mode-level primary provider resolution

`resolvePrimaryProviderForMode()` currently resolves:
- `eco` -> `ollama`
- `standard` -> DashScope if key exists, else OpenRouter, else Ollama
- `pro` -> Anthropic if key exists, else OpenRouter, else DashScope, else Ollama

### B. Registry defaults used in mode-router and step-router

`src/provider-registry.ts` currently defines many entries with:
- eco chat/tiny/coder -> DeepSeek defaults
- standard chat/coder -> DashScope
- pro reason/or fallback -> DashScope or DeepSeek

### C. Direct lane provider plans

`mode-router` builds provider plans that often choose:
- eco -> DeepSeek-backed model entry from registry
- standard -> DashScope or DeepSeek
- pro -> DeepSeek primary, not Claude primary

Implication:
- "eco/local" is not consistently local across the stack
- mobile integration should not trust comments or mode names alone
- integration should target explicit call sites and runtime decisions, not conceptual tiers

Additional typing inconsistency:
- `src/step-router.ts` limits `StepProvider` to `ollama | openrouter | claude`
- `src/container-runner.ts` already contains handling for `dashscope` and `deepseek`
- source suggests the type layer is behind the runtime behavior

## 12. Deterministic execution state

Primary code:
- `src/deterministic-executor.ts`

Before using a model for a micro-task, the system can bypass models entirely for:
- URL fetches
- simple file reads
- safe git reads
- safe shell reads

This matters for mobile:
- some perceived "worker load" can be reduced without any model
- a mobile scheduler should preserve deterministic bypass before invoking local inference

## 13. Concurrency, parallelization, and thermal scheduling state

Current implemented concurrency:
- global queue concurrency only
- default `MAX_CONCURRENT_CONTAINERS = 2`
- queue backpressure and retry logic exist
- task/micro execution inside a single task is mostly serial

Current non-implemented or incomplete areas:
- no thermal scheduling code found in `src/`, `agent-runner/`, or `classifier/`
- no device heat/battery/inference throttling policy
- `!parallel` / `!parallel3` parsed and persisted, but not enforced by scheduler
- drip-feed remains sequential
- micro-task decomposition is not wired into live execution

This is the biggest gap relative to the requested mobile direction.

## 14. Persistence and state

SQLite:
- file: `store/messages.db`
- created by `src/db.ts`

Tables relevant to mobile integration:
- `messages`
- `chats`
- `scheduled_tasks`
- `task_run_logs`
- `sessions`
- `registered_groups`
- `processed_messages`
- `project_memory`
- `memory_signals`
- `memory_token_log`
- `staging_cache`

JSON sidecars / files:
- active task registry: `active-tasks.json`
- clarification state: `logs/clarification-pending.json`
- runtime split metrics: `logs/runtime-split.json`
- drip-feed staging: `data/staging/<taskId>.json`

Task registry:
- `src/task-registry.ts`
- statuses: `running`, `awaiting_pro_shard_approval`, `pr_open`, `ci_passed`, `done`, `failed`

## 15. Memory and context state

Primary code:
- `src/memory-session.ts`
- `src/context-manager.ts`
- `src/group-memory.ts`

Execution loads a memory anchor before task run:
- anchor is based on project memory, signal history, and optional Cognee search
- anchor is cached per session

Context compaction:
- `context-manager` compresses history with a local Ollama summarizer
- defaults still assume local `qwen3:8b` for summarization

Mobile relevance:
- if mobile local models are introduced broadly, context compaction is another natural on-device inference seam
- it is separate from classifier and worker-model integration

## 16. Observability and control surface

Primary code:
- `src/control-server.ts`
- `src/monitor.ts`
- `src/runtime-split.ts`

Exposed local HTTP surface includes:
- health
- readiness
- services
- tasks
- budgets
- runtime-split metrics
- pro-shard approval

Useful mobile-related telemetry already present:
- lane usage split
- queue health
- retry groups
- runtime readiness
- execution run history

Missing telemetry for mobile work:
- no thermal metrics
- no device-local inference latency buckets
- no on-device memory pressure metrics
- no model warm/cold-load counters
- no per-step local-vs-cloud execution accounting for drip-feed

## 17. What is already a clean seam for mobile

### Best seam: classifier

Use the existing sidecar contract in `src/task-classifier.ts`:
- keep `POST /classify`
- return current route/score/fallback shape
- let Node keep the fallback chain

### Next seam: worker model selection for drip-feed

The live seam is:
- `dripFeedExecute()` -> `containerExecute()`
- `containerExecute()` -> `runContainerPrompt()`
- `runContainerPrompt()` -> runner/provider script mapping

If mobile workers are to execute drip micro-steps locally, the least disruptive design is:
- add a new provider/runner identity for mobile local execution
- extend step routing/runtime resolution to select that runner
- keep `dripFeedExecute()` unchanged except for routing metadata if needed

### Potential future seam: micro-task decomposer

`src/micro-task-decomposer.ts` is already isolated and local-model based.
But it must be wired into the live planning/drip path before it matters operationally.

## 18. High-risk mismatches the mobile team should assume are real until fixed

1. Local-vs-cloud intent is inconsistent across comments, registry defaults, and runtime selection.
2. `!parallel` state exists but does not influence the actual scheduler.
3. No thermal scheduling implementation exists.
4. `decomposeTask()` is present but not part of the main execution path.
5. Runner script names in `runtime-resolver` do not match `agent-runner/src` source files.
6. DashScope secret/env naming is inconsistent between main runtime and agent-runner.
7. `runContainerPrompt()` contains a recursive lease-release bug in current source.
8. Plan UI selections for `orchestrator` and `worker` appear to be collected but not applied to execution.

## 19. Recommended integration order

If the mobile team wants the smallest-risk path:

1. Replace or augment the classifier sidecar first.
2. Add a first-class mobile-local runner identity for worker execution.
3. Teach step/runtime routing when to select that runner.
4. Add telemetry for local inference latency, memory pressure, and thermal state.
5. Only then add true intra-task parallelization.
6. Wire the micro-task decomposer into the live path if finer-grained mobile scheduling is still needed.

## 20. Files the mobile team should read first

Highest priority:
- `src/task-classifier.ts`
- `classifier/main.py`
- `src/intake-policy.ts`
- `src/direct-runner.ts`
- `src/execution-lifecycle.ts`
- `src/drip-feed-executor.ts`
- `src/micro-task-decomposer.ts`
- `src/container-runner.ts`
- `src/runtime-resolver.ts`
- `src/keet-provider-config.ts`
- `src/provider-registry.ts`
- `src/app-infra/queue/platform-queue-service.ts`

Runner-side:
- `agent-runner/src/index.ts`
- `agent-runner/src/index-openrouter.ts`
- `agent-runner/src/index-qwen.ts`
- `agent-runner/src/openai-compat-runner.ts`

## 21. Bottom line

Keets already has enough structure to support mobile local models, but not by configuration alone.

What is real today:
- classifier seam: ready
- direct/container split: real
- drip-feed execution: real
- queueing/backpressure: real

What is not real yet:
- mobile worker abstraction
- true parallel micro-task execution
- thermal scheduling
- execution-time use of collected orchestrator/worker UI selections

The mobile effort should treat this codebase as an orchestrator with a few strong seams and several incomplete model-routing assumptions, not as a finished local-first runtime.
