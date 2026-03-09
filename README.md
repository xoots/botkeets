# KEET

KEET is a local-first coding agent orchestrator for Telegram/Discord with containerized execution, per-step model routing, and budget/cost guardrails.

## Current Capabilities (Live)

- Telegram + Discord ingestion with startup preflight validation
- Local classification + planning (`qwen3:8b` fallback path included)
- Complex-task planner -> structured task runner -> autonomous escape hatch
- Per-step routing across `ollama | openrouter | claude`
- Inline overrides: `!pro`/`!claude`, `!standard`/`!std`, `!local`/`!eco`, `!auto`, `!go`, `!fast`, `!plan`, `!drip`, `!nodrip`, `!parallel`, `!parallel3`
- Drip-feed micro-task execution (auto-activates for ≥3 subtasks in structured mode; suppress with `!nodrip`)
- Credential pass-through from workspace `vault.env` (values passed in-memory)
- Clarification pause/resume flow (`!go` supported)
- Budget enforcement with hard block reasons:
  - `blocked_budget_global`
  - `blocked_budget_mode`
  - `blocked_budget_task`
  - `blocked_budget_shard`
  - `blocked_budget_escalation`
- Pro manual shard approval mode (`PRO_SHARD_STRATEGY=manual_approval`) with approval endpoint
- Context policy guardrails:
  - compaction trigger: 40%
  - rebase target: 26%
  - hard stop: 46%
- Recursive shard split/requeue when context hard-stop is hit
- Control API auth for mutating endpoints (`X-KEET-ADMIN-TOKEN`)
- Runtime split metrics track KEET task runs and CoPaw bridge counters
- Active CoPaw authority bridge via `src/keet-provider-config.ts`
- Standalone control contract keeps CoPaw/Trigger adapter routes as explicit `410` stubs, not live surfaces
- **Project-scoped memory system** (Sprints 1–6):
  - Canon scoring: alpha=0.50 semantic + beta=0.35 recency + gamma=0.15 frequency
  - HOT/WARM/COLD warmth tiers with per-tier anchor token budgets
  - Signal collection hooks: `direct_query`, `semantic_proximity`, `task_completion` (fire-and-forget)
  - Memory anchor assembled and injected into container task context before execution
  - Mem0 fact extraction (local Ollama/qwen-plus) + Cognee semantic search (graceful degradation)
  - Manual seed CLI: `scripts/seed-memory.ts` (flags: `--project-id`, `--keywords`, `--summary`, `--list`, `--delete`)
- **Group-scoped stopgap memory** (flat-file):
  - `data/memory/{group_folder}/MEMORY.md` — cumulative facts (50-bullet cap)
  - `data/memory/{group_folder}/YYYY-MM-DD.md` — daily journals
  - Pre-task: injects group memory + recent journals as anchor prefix
  - Post-task: extracts facts via DashScope → writes journal + merges MEMORY.md

## Runtime Defaults

- Container runtime default: Apple container (`CONTAINER_RUNTIME_TYPE=apple`)
- Image contract: `CONTAINER_IMAGE=nanoclaw-agent:latest`
- Deployment profile default: `KEET_DEPLOYMENT_PROFILE=full-execution`
- Node: `>=20`

## Deployment Profiles

- `full-execution` (recommended on VPS): orchestration + local execution lanes
- `orchestrator-only` (scoped for Railway/control surfaces): orchestration only, execution lane requirements disabled

Profile references:
- [docs/deploy-profiles.md](/Users/curtis/Documents/AGENT/KEET/docs/deploy-profiles.md)
- [docs/deploy-vps.md](/Users/curtis/Documents/AGENT/KEET/docs/deploy-vps.md)
- [docs/deploy-railway.md](/Users/curtis/Documents/AGENT/KEET/docs/deploy-railway.md)
- [docs/dependency-pinning.md](/Users/curtis/Documents/AGENT/KEET/docs/dependency-pinning.md)

## Quick Start

```bash
npm install
cp .env.example .env
npm run doctor
npm run build
npm run dev
```

For PM2:

```bash
npm run pm2:start
```

## Factory Regeneration

Exact regeneration command:

```bash
npm run factory
```

`npm run factory` is an alias for `npm run factory:agents` and prints a JSON summary from `scripts/factory-agents.ts` with these fields:

- `ok`
- `decisions`
- `commits`
- `providers`
- `updatedFiles`
- `updated`

Phase C foundational preflight check:

```bash
npm run phasec:preflight
```

The command is non-mutating and exits non-zero if critical env is missing (runtime ports, async runtime mode, Trigger facade URL, embedding env presence).

## API Contract (Current)

Current live control endpoints (`src/control-server.ts`):

- `GET /api/health`
- `GET /api/readiness`
- `GET /api/services`
- `GET /api/metrics/routing`
- `GET /api/metrics/step-routing`
- `GET /api/metrics/sqlite`
- `GET /api/metrics/cost-guards`
- `GET /api/metrics/runtime-split`
- `GET /api/keet/mcp`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `GET /api/approvals/pending`
- `GET /api/budgets`
- `POST /api/budgets` (auth)
- `GET /api/budgets/usage`
- `GET /api/tasks/:id/budget`
- `POST /api/tasks/:id/budget` (auth)
- `POST /api/tasks/:id/pro-shard/approve` (auth)
- `POST /api/mode` (auth)
- `POST /api/services/:name/:action` (auth, `name in {keet, keet-classifier}`, `action in {start, stop, restart}`)

Standalone-disabled adapter endpoints return `410` with `standalone_adapter_disabled`:

- `GET /api/copaw/providers`
- `GET /api/copaw/active-models`
- `GET /api/copaw/mcp`
- `GET /api/copaw/skills`
- `GET /api/copaw/workspace/status`
- `GET /api/copaw/ui/state`
- `POST /api/copaw/ui/action` (auth)
- `GET /api/copaw-agent/health`
- `GET /api/copaw-agent/capabilities`
- `GET /api/copaw-agent/sessions`
- `POST /api/copaw-agent/sessions` (auth)
- `POST /api/copaw-agent/chat` (auth)
- `POST /api/trigger/dag/run`

Deprecated endpoints return migration stubs (`410`, `copaw_migration_removed_endpoint`):

- `GET /api/copaw/health`
- `GET /api/copaw/runs`
- `POST /api/copaw/circuit/reset`
- `GET /api/metrics/copaw`
- `POST /api/copaw/config`

## Config Highlights

See `.env.example` for full reference. Important V3.2 controls:

- `PRO_SHARD_STRATEGY=manual_approval|auto_selective|off`
- `PRO_MAX_SHARDS_PER_TASK`
- `PRO_MAX_CALLS_PER_TASK`
- `MAX_RECURSIVE_SHARD_SPLITS`
- `COMPACTION_TRIGGER_PCT=0.40`
- `REBASE_TARGET_PCT=0.26`
- `CONTEXT_HARD_STOP_PCT=0.46`
- `GLOBAL_DAILY_BUDGET_USD`
- `MODE_BUDGET_*_DAILY_USD`
- `DEFAULT_TASK_BUDGET_USD`
- `DEFAULT_SHARD_BUDGET_USD`
- `DEFAULT_ESCALATION_BUDGET_USD`
- `COPAW_ENABLED`
- `COPAW_ROUTE_COMPLEX_PCT`
- `COPAW_TIMEOUT_MS`
- `COPAW_MAX_INFLIGHT`
- `COPAW_FAILURE_CIRCUIT_THRESHOLD`
- `COPAW_BASE_URL`
- `COPAW_UPSTREAM_PIN`
- `COPAW_WORKING_DIR`
- `COPAW_SECRET_DIR`
- `KEET_COPAW_MIGRATION_PHASE=dual-read-single-write|copaw-write-warn-legacy-read|copaw-only`
- `KEET_COPAW_ALLOW_LEGACY_READS`
- `KEET_COPAW_WARN_ON_LEGACY_READS`
- `KEET_CONTROL_STUB_DEPRECATED_ENDPOINTS`
- `KEET_MIGRATION_GATE_MAX_LEGACY_READS`
- `KEET_DEPLOYMENT_PROFILE=full-execution|orchestrator-only`
- `KEET_REQUIRE_CONTAINER_RUNTIME`
- `KEET_REQUIRE_AGENT_IMAGE`
- `KEET_REQUIRE_CLASSIFIER_SIDECAR`
- `KEET_REQUIRE_COPAW_SIDECAR`
- `KEET_CONTAINER_RUNTIME_BIN`

## What's In Progress

- Memory system — stopgap group-scoped flat files live; full scoring/embeddings/Cognee not yet active
- `discord.js` not yet installed — run `npm install` in `AGENT/` before Discord works
- MCP server support
- Weekly self-improvement summarizer cron
- PR automation only fires if workspace has a git remote — local-only tasks get `status: done` directly

## Docs Policy

Authoritative docs for current behavior:

- `README.md`
- `ARCHITECTURE.md`
- `SPEC.md`
- `docs/truth-docs-current.md`

Planning and audit docs under `docs/` may include roadmap/historical analysis; treat them as non-authoritative unless explicitly marked current.

## Authority Model (Current)

Current runtime authority:

- `src/keet-provider-config.ts` is the single resolver boundary for runtime paths
- Resolver functions are CoPaw-authoritative for provider/model/base-url resolution
- `src/copaw-system.ts` is active bridge code on the runtime import graph

## Current Host Blockers

The repository implementation is ahead of the local host/runtime in one place:

- Stock `CoPaw Agent` is now live through the repo-local Python `3.11` sidecar venv and local Ollama.
- Apple container kernel is configured, but image build for `nanoclaw-agent:latest` is still blocked by DNS resolution failure inside the Apple container builder VM:
  - `Temporary failure resolving 'deb.debian.org'`

This is a host environment blocker, not a current repo-code blocker.

## Hybrid Boundary (Current)

- Direct path: `src/direct-runner.ts` handles non-complex intents and returns `false` for complex intent
- Complex path: `src/container-runner.ts` invokes planner/task-runner and container execution
- Shared provider boundary: both paths resolve credentials/models through `src/keet-provider-config.ts`
- Control boundary: all operator and metrics endpoints come from `src/control-server.ts`

## Rollback

If the CoPaw operator UI or adapter path causes incidents, use the rollback runbook:

- [docs/COPAW_UI_ROLLBACK_RUNBOOK.md](/Users/curtis/Documents/AGENT/KEET/docs/COPAW_UI_ROLLBACK_RUNBOOK.md)
