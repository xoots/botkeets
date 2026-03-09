# Launch Runbook

## Bring-up Goal

Default target on this host: boot KEET in explicit degraded mode, with the direct lane usable and full local execution blockers called out clearly.

`full-execution-ready` remains supported, but it is not the expected baseline on this host until the container daemon, local image, and classifier are healthy.

## Bring-up Order

1. `npm run doctor`
2. `npm start`
3. Optional recovery toward `full-execution-ready`:
   - `./classifier/start.sh`
   - `npm run image:build`

Build first if needed:

1. `npm run build`
2. `npm run image:build`

## Verify Runtime State

Run these in a normal host shell:

```bash
curl --max-time 5 -s http://127.0.0.1:8766/api/health
curl --max-time 5 -s http://127.0.0.1:8766/api/readiness
curl --max-time 5 -s http://127.0.0.1:8766/api/tasks
```

Healthy degraded bring-up on this host means:

- `npm run doctor` exits `0`
- `/api/health` returns `{"ok":true,...}`
- `/api/health` includes `runtime.state: "degraded"`
- `/api/readiness` includes:
  - `state: "degraded"`
  - `bootable: true`
  - `full_execution_ready: false`
  - `capabilities.direct_lane.available: true`
  - `capabilities.container_lane.available: false`
  - `capabilities.classifier.available: false` when the sidecar is still down

`full-execution-ready` means:

- `npm run doctor` still exits `0`
- `/api/readiness` returns `state: "full-execution-ready"`
- `capabilities.container_lane.available: true`
- `capabilities.classifier.available: true`
- `capabilities.full_execution.available: true`
- classifier health returns `{"status":"ok",...}`

## First Use

- Telegram ingress is the current primary path.
- The trigger must start the message: `@Andy ...`
- `!pro` / `!claude` only parse when they are the first token.
- If you need both, send two messages in order:
  1. `!pro`
  2. `@Andy <task>`

Verify the task reached a terminal state with:

```bash
curl --max-time 5 -s http://127.0.0.1:8766/api/tasks
curl --max-time 5 -s http://127.0.0.1:8766/api/tasks/<task_id>
```

## Exact Blockers

These are the host-level degraded blockers currently seen from `npm run doctor` on this host:

- `WARN container_runtime_reachable — container daemon is unavailable`
- `WARN container_agent_image — Agent image nanoclaw-agent:latest is missing`
- `WARN classifier_sidecar_health — Classifier sidecar is not reachable at http://127.0.0.1:8765/health`
- `Decision: Bootable in degraded mode: container_runtime_reachable, container_agent_image, classifier_sidecar_health`

Doctor should also report:

- `State: degraded (bootable=true degraded=true full_execution_ready=false)`
- `Direct lane: available`
- `Container lane: unavailable`
- `Classifier: unavailable`
- `Full execution: unavailable`

Startup failure signatures:

- `Startup readiness failed: ...`

Startup degraded signature:

- `startup capability state`
- `startup entering degraded mode`
