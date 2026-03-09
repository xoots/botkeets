# Hybrid Contract Freeze v1

Date: 2026-03-05
Status: Phase 1 freeze with Phase 2 implementation notes

## Purpose

Freeze the runtime-true API and authority contract before Phase 2 changes.

## Runtime Sources Audited

- `src/control-route-contract.ts`
- `src/control-server.ts`
- `src/index.ts`
- `src/container-runner.ts`
- `src/direct-runner.ts`
- `src/keet-provider-config.ts`
- `src/copaw-system.ts`
- `docs/truth-docs-current.md`
- `ARCHITECTURE.md`
- `README.md`

## Live Endpoints

Source of truth: `src/control-route-contract.ts` and the re-exports from `src/control-server.ts`.

- `GET /api/health`
- `GET /api/services`
- `GET /api/readiness`
- `GET /api/metrics/routing`
- `GET /api/metrics/sqlite`
- `GET /api/metrics/step-routing`
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
- `POST /api/services/:name/:action` (auth)

## Standalone-Disabled Adapter Endpoints

These routes are intentionally present only as `410` stubs with `standalone_adapter_disabled` and are not part of the live standalone contract:

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

## Deprecated / Non-Live Endpoints (Post-Phase 2)

Source of truth: `src/control-route-contract.ts` exported `NON_LIVE_CONTROL_ROUTES`.

- `GET /api/copaw/health`
- `GET /api/copaw/runs`
- `POST /api/copaw/circuit/reset`
- `GET /api/metrics/copaw`
- `POST /api/copaw/config`

These remain roadmap-or-removed and are not implemented in the live handler.

## Runtime Authority

Phase 2 live authority model:

- `src/keet-provider-config.ts` remains the single runtime resolver boundary.
- Resolver functions return `authority: 'copaw' | 'legacy'`.
- CoPaw authority is active when CoPaw provider data exists.
- Legacy env/config is fallback when CoPaw authority data is missing.
- `src/copaw-system.ts` is active bridge code and imported by runtime/control modules.

Decision:

- Keep KEET guardrails (budget, approvals, task registry, shard handling) authoritative.
- Keep one provider-resolution seam across direct/container paths.

## Live Hybrid Path Definitions

- Non-complex requests: `src/direct-runner.ts` direct provider path.
- Complex requests: `src/container-runner.ts` planner/task-runner/container path.
- Shared provider boundary: both paths use `src/keet-provider-config.ts`.
- Operator/control boundary: `src/control-server.ts` endpoints only.

## Deprecation Decisions

- Removed contradictory "deprecated/non-live" status from `src/copaw-system.ts`.
- Deferred-only routes remain explicitly listed in `NON_LIVE_CONTROL_ROUTES`.

## Tests Freezing This Contract

- `src/__tests__/standalone-contract.test.ts`
  - freezes exact live endpoint set
  - verifies disabled standalone adapter routes and removed migration routes return the correct `410` contract
- `src/hybrid-contract.test.ts`
  - freezes bridged authority contract (`copaw | legacy`)
  - freezes readiness checks via shared resolver behavior
- `src/copaw-authority-bridge.test.ts`
  - verifies legacy fallback when CoPaw providers data is missing
  - verifies CoPaw authority when providers data is present

## Intentional Failing Assertions

None in this freeze. All contract-lock tests are expected to pass in current runtime.

## Phase 2 Seam Checklist

- [x] `src/control-server.ts` route contract updated atomically with runtime behavior
- [x] `src/keet-provider-config.ts` authority resolver behavior bridged to CoPaw with fallback
- [x] `src/control-server.test.ts` and `src/hybrid-contract.test.ts` updated
- [x] docs (`README.md`, `ARCHITECTURE.md`, `docs/truth-docs-current.md`) updated in same change

## Next-Phase Required Code Seams (Phase 3+)

1. Control API seam
- Reintroduce any CoPaw endpoint through `src/control-server.ts` with explicit route-contract updates.

2. Authority seam
- If authority transitions to CoPaw, replace/bridge resolver behavior in `src/keet-provider-config.ts` and update contract tests atomically.

3. Execution seam
- Keep direct/container resolver boundary shared to avoid divergent provider behavior.

4. Documentation seam
- Update `README.md`, `ARCHITECTURE.md`, and `docs/truth-docs-current.md` in the same change that alters routes or authority.
