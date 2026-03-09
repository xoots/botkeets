# Deployment Profiles

KEET now ships with two explicit deployment profiles.

## 1) `full-execution` (recommended for VPS)

This profile runs both orchestration and execution lanes on the same host.

Required dependencies:
- Container runtime CLI + daemon (`docker` recommended on VPS)
- Worker package (`agent-runner/runtime-artifacts.json` + `agent-runner/dist/*`)
- Agent image (`CONTAINER_IMAGE`, default `nanoclaw-agent:latest`)
- Classifier sidecar

Key env contract:
- `KEET_DEPLOYMENT_PROFILE=full-execution`
- `KEET_REQUIRE_CONTAINER_RUNTIME=true`
- `KEET_REQUIRE_AGENT_IMAGE=true`
- `KEET_REQUIRE_CLASSIFIER_SIDECAR=true`

## 2) `orchestrator-only` (Railway-scoped)

This profile runs control/orchestration surfaces only.

Supported:
- Control API and readiness endpoints
- Budget/routing metrics and task surfaces
- CoPaw control UI routes and agent proxy routes (when sidecar is reachable)

Unsupported in this repo profile:
- Local nested container execution lane on the host
- Requiring local `CONTAINER_IMAGE` for readiness

Key env contract:
- `KEET_DEPLOYMENT_PROFILE=orchestrator-only`
- `KEET_REQUIRE_CONTAINER_RUNTIME=false`
- `KEET_REQUIRE_AGENT_IMAGE=false`
- `KEET_REQUIRE_CLASSIFIER_SIDECAR=true`

## Profile behavior in diagnostics

- Supported build contract:
  - `npm run build` compiles the root app and builds or verifies the shipped worker package.
  - `npm run image:build` builds the worker image named by `CONTAINER_IMAGE` through the active runtime resolved from `KEET_CONTAINER_RUNTIME_BIN` or `CONTAINER_RUNTIME_TYPE`.
- `npm run doctor` prints `state`, `bootable`, `degraded`, `full_execution_ready`, plus direct/container/classifier/full-execution capability lines before the individual checks.
- `npm run doctor` reports `FAIL` for fatal blockers and `WARN` for degraded or optional checks.
- `GET /api/readiness` now includes top-level runtime state plus `deployment`:
  - `state`
  - `bootable`
  - `degraded`
  - `full_execution_ready`
  - `capabilities.direct_lane`
  - `capabilities.container_lane`
  - `capabilities.classifier`
  - `capabilities.full_execution`
  - `build_contract`
  - `profile`
  - `expectations`
  - `checks`
  - `blockers` (required checks that failed)
- Startup uses the same capability decision model. Fatal blockers still stop boot; container/image/classifier blockers downgrade to explicit degraded mode when the direct lane is available.
