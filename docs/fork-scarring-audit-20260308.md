# Fork Scarring Audit

Date: 2026-03-08

## Purpose

Inventory the remaining fork and external-runtime scarring that should be retired so the end-state is KEET-native across runtime, control surfaces, and operator docs.

This is not just a naming pass. Some references are public contracts, persisted state, runtime markers, or operational dependencies. Those need staged replacement, not blind search/replace.

## Current Finding

The repo still exposes three non-KEET identities in active code paths:

- `NanoClaw`: old product/package/image/runner identity
- `CoPaw`: bridge/control/runtime authority identity
- `Trigger`: async runtime identity exposed in control and factory flows

End-state should be KEET-branded surfaces with optional adapters behind KEET-owned boundaries.

## Scarring By Severity

### P0: Runtime and persisted identity scarring

These affect execution, session state, container interoperability, or persisted metadata.

- Container image identity still uses `nanoclaw-agent`
  - `src/config.ts`
  - `build.sh`
  - `README.md`
  - `docs/deploy-profiles.md`
  - `docs/deploy-vps.md`
  - `docs/APPLE-CONTAINER-NETWORKING.md`
  - `docs/monitoring-test-playbook.md`
- Container protocol markers and env vars still use `NANOCLAW`
  - `src/container-runner.ts`
  - `agent-runner/src/index.ts`
  - `agent-runner/src/openai-compat-runner.ts`
  - `agent-runner/src/ipc-mcp-stdio.ts`
- Container instance names still use `nanoclaw-step-*`
  - `src/container-runner.ts`
- Workspace git identity still uses NanoClaw
  - `src/project-workspace.ts`
- MCP built-in server identity is still reserved as `nanoclaw`
  - `src/copaw-system.ts`
  - `agent-runner/src/index.ts`
  - `agent-runner/src/ipc-mcp-stdio.ts`
- Runtime/log state still records `copaw` as a first-class lane/runtime identity
  - `src/runtime-registry.ts`
  - `src/runtime-split.ts`
  - `src/execution-run-history.ts`
  - `logs/runtime-split.json`

### P1: Public API, config, and control-surface scarring

These are externally visible and must be migrated with compatibility rules.

- Public control API still exposes `/api/copaw/*` and `/api/copaw-agent/*`
  - `src/control-server.ts`
  - `README.md`
  - `docs/truth-docs-current.md`
  - `docs/hybrid-contract-freeze-v1.md`
- Runtime authority and migration logic are still named around CoPaw
  - `src/copaw-system.ts`
  - `src/copaw-lane-bridge.ts`
  - `src/copaw-migration.ts`
  - `src/keet-provider-config.ts`
  - `src/runtime-registry.ts`
  - `src/mode-router.ts`
  - `src/direct-runner.ts`
  - `src/intake-policy.ts`
- Env/config surface still exposes `COPAW_*` and `KEET_COPAW_*`
  - `.env.example`
  - `src/config.ts`
  - `README.md`

### P2: Package, docs, and ops scarring

These are lower-risk but keep the repo identity incoherent.

- Package metadata still names NanoClaw
  - `package.json`
  - `agent-runner/package.json`
- Product/log strings still announce NanoClaw at startup or in comments
  - `src/index.ts`
  - `src/direct-runner.ts`
  - `src/provider-strategy.ts`
  - `agent-runner/src/index.ts`
  - `agent-runner/src/openai-compat-runner.ts`
  - `agent-runner/src/ipc-mcp-stdio.ts`
- Docs still mix KEET, NanoClaw, and CoPaw as active identities
  - `README.md`
  - `docs/SECURITY.md`
  - `docs/SUMMARY.md`
  - `docs/CODE IS TRUTH.md`
  - `docs/deploy-vps.md`
  - `docs/deploy-railway.md`
  - `docs/dependency-pinning.md`
  - `docs/SETUP_GUIDE_OATH_MIGRATION.md`
  - `docs/remake this when agent done/*`
- GitHub Action still points at a NanoClaw upstream location
  - `action.yml`

### P2: Trigger runtime scarring

`Trigger` is different from `NanoClaw` and `CoPaw`: it is not fork residue, but it is still a third-party runtime identity exposed directly to operators. If the end-state is "all public surfaces are KEET", this also has to move behind a KEET facade.

- Async runtime modules are named under `src/trigger/*`
- Control API exposes `/api/trigger/dag/run`
- Factory/context docs describe Trigger as a first-class runtime
- Evidence and monitoring docs expose Trigger directly

Primary files:

- `src/trigger/tasks.ts`
- `src/trigger/dag-tasks.ts`
- `src/control-server.ts`
- `src/task-runner.ts`
- `src/mcp-server.ts`
- `src/factory/context-factory.ts`
- `README.md`
- `docs/signal-dag-e2e-evidence-20260306T000429Z.md`

## What Is Not Just Naming

The following require migration logic or staged cutovers:

- persisted file names and metric keys
- control API routes
- env var names
- container protocol markers
- MCP server keys
- runtime IDs and session/logging records

These should not be changed ad hoc in unrelated feature work.

## Recommended Retirement Order

1. Freeze a KEET-native target contract for runtime IDs, routes, env vars, markers, and image names.
2. Land Sprint 3 runtime hardening first so fallback/session/container behavior is deterministic before names move.
3. Introduce KEET-native internal names behind compatibility adapters.
4. Migrate operator-facing docs and package metadata.
5. Deprecate old public aliases with explicit sunset rules.
6. Remove compatibility aliases only after persisted state and control clients no longer depend on them.

## Exit Criteria

Fork scarring is not done until all of the following are true:

- No public route is branded `nanoclaw`, `copaw`, or `trigger` unless explicitly retained as a compatibility alias.
- No new runtime/log/session/container artifacts introduce those names.
- Package, image, MCP, and workspace identities are KEET-native.
- Docs describe adapters and upstreams as implementation details, not first-class product identities.
- Compatibility aliases have explicit removal owners and dates.
