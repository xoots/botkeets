# CODE IS TRUTH

Generated from the shipped code paths on 2026-03-08.

## Shipped standalone architecture

KEET ships as a standalone orchestrator with three runtime pieces:

1. Root orchestrator app
   - Entry: `src/index.ts`
   - Built by: `npm run build`
   - Runs chat ingress, SQLite state, planning, direct-path handling, queueing, and the control server.

2. Worker package and worker image
   - Package source: `agent-runner/src/*`
   - Package contract: `agent-runner/runtime-artifacts.json` plus the matching files in `agent-runner/dist/*`
   - Image build: `npm run image:build`
   - Used by `src/container-runner.ts` for containerized execution.

3. Classifier sidecar
   - Health endpoint: `http://127.0.0.1:8765/health`
   - Part of full local execution readiness unless explicitly disabled by profile/env gates.

## Supported build contract

The supported operator build path is:

1. `npm run build`
   - Compiles the root app.
   - Builds the worker package when `agent-runner/node_modules` exists.
   - Otherwise verifies the shipped worker package against `agent-runner/runtime-artifacts.json`.

2. `npm run image:build`
   - Verifies the worker package again.
   - Builds the worker container image named by `CONTAINER_IMAGE`.

This is the only build contract that startup, doctor, and readiness now describe.

## Shared launch contract

The deployment contract is profile-gated and shared by:

- startup in `src/index.ts`
- `npm run doctor`
- `GET /api/readiness`

Required checks for `full-execution`:

- container runtime CLI is installed
- container runtime daemon is reachable
- worker package manifest and runtime artifacts are present
- direct worker source build passes via `cd agent-runner && npm run build`
- worker image exists for `CONTAINER_IMAGE`
- classifier sidecar is healthy

Required checks for `orchestrator-only`:

- classifier sidecar is healthy

The `orchestrator-only` profile keeps runtime/image checks visible in diagnostics, but they are not blockers.

## Startup behavior

`src/index.ts` now does two explicit fail-fast passes before boot completes:

1. Channel token preflight from `src/startup-preflight.ts`
2. Deployment contract checks from `src/deployment-contract.ts`

If the direct lane is unavailable, required deployment blockers stay fatal and startup exits.

If the direct lane is available, container/image/classifier blockers are downgraded to degraded mode and startup continues with explicit capability reporting.

## Readiness contract

`GET /api/readiness` returns:

- `state` (`blocked` | `degraded` | `full-execution-ready`)
- `bootable`
- `degraded`
- `full_execution_ready`
- `capabilities.direct_lane`
- `capabilities.container_lane`
- `capabilities.classifier`
- `capabilities.full_execution`
- `deployment.build_contract`
- `deployment.profile`
- `deployment.expectations`
- `deployment.checks`
- `deployment.blockers`

`GET /api/health` now also includes the same runtime capability state under `runtime`.

That response is the HTTP view of the same contract used by startup and doctor.

## Standalone boundary

The shipped standalone surface is:

- live: root orchestrator, worker package/image, classifier-backed readiness contract, control API, budgets, task inspection, queue/runtime metrics
- non-launch-critical: CoPaw adapter surfaces and Trigger DAG surfaces remain in-tree, but they are not part of the supported standalone launch contract

## Remaining fork scarring

Fork scarring still exists and is not solved by Sprint 4:

- `nanoclaw-agent:latest` is still the default image name
- package metadata and some log strings still say `NanoClaw`
- non-live and adapter routes still expose `copaw` and `trigger` names

Those names are now explicitly treated as migration debt, not as part of the standalone launch contract.
