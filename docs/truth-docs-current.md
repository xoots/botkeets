# KEET Truth Docs (Current Behavior)

Date: 2026-03-08

This document tracks verifiable runtime behavior from source code.

## Current (Live)

- Control server live routes are the KEET-owned standalone contract from `src/control-route-contract.ts`.
- `GET /api/health` includes liveness plus runtime capability state.
- `GET /api/readiness` exposes `state`, `bootable`, `degraded`, `full_execution_ready`, and lane capability details for direct, container, classifier, and full execution.
- Mutating control endpoints require `X-KEET-ADMIN-TOKEN`.
- Task visibility/approval/budget endpoints are live.
- Runtime-split and routing metrics endpoints are live.
- Direct execution and container execution both resolve providers via `src/keet-provider-config.ts`.
- Active provider authority is CoPaw-managed with migration-phase controls.
- `src/copaw-system.ts` is active bridge code imported by runtime/control paths.
- Startup can continue in explicit degraded mode when direct execution is available but container/image/classifier checks are failing.

Live control endpoints:

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

These endpoints are intentionally present only as `410` stubs with `standalone_adapter_disabled`:

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

## Deprecated Endpoint Stubs

These endpoints are intentionally stubbed with `410` and `copaw_migration_removed_endpoint`:

- `GET /api/copaw/health`
- `GET /api/copaw/runs`
- `POST /api/copaw/circuit/reset`
- `GET /api/metrics/copaw`
- `POST /api/copaw/config`

## Operational Commands

- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run migration:copaw -- status`
- `npm run migration:copaw -- gate`
- `npm run migration:copaw -- reset-telemetry`

## Authoritative Contract Artifacts

- `src/control-route-contract.ts`
- `src/control-server.ts`
- `src/keet-provider-config.ts`
- `docs/hybrid-contract-freeze-v1.md`
