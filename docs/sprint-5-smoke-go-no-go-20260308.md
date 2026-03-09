# Sprint 5 Smoke Coverage and Go/No-Go

Date: 2026-03-08

## Live Host Bring-Up

Observed on the local host:

- `npm run doctor` passed
- `GET /api/health` returned `{"ok":true,...}`
- `GET /api/readiness` returned `deployment.blockers: []`
- classifier sidecar health returned `{"status":"ok",...}`

## Live Task Evidence

Confirmed in `GET /api/tasks`:

- existing real Telegram inbound task reached terminal `done`
  - `2026-03-08-yes-i-am-what-s-the-weather-like-there-i`

New complex/pro smoke attempts exposed live first-use issues:

- drip-feed previously marked `STEP_FAILED:` outputs as success
- standard step routing could hand OpenRouter a non-OpenRouter model id
- Telegram ingress currently requires `@Andy` at the start of the message, while `!pro` only parses when it is the first token

## Fixes Applied

- `src/drip-feed-executor.ts`
  - treat `STEP_FAILED:` container output as a real step failure
- `src/step-router.ts`
  - use provider-compatible default models for `ollama`, `openrouter`, and `claude`
- added focused regression tests for both fixes

Verification:

```bash
npm test -- src/__tests__/step-router.test.ts src/__tests__/drip-feed-executor.test.ts
npm run build
```

## Go/No-Go Call

Current call: `NO-GO` for a clean complex first-use smoke on the live stack.

Blocking live issues still present:

- ingress contract mismatch:
  - trigger requires `^@Andy`
  - mode override requires `^!pro`
- planner/provider path still fell back through `deepseek` and produced generic 3-step plans during live complex smoke

## Operator Handoff

Use [docs/launch-runbook.md](/Users/curtis/Documents/AGENT/AGENTKEETS/docs/launch-runbook.md) for bring-up order, verification commands, and exact blocker signatures.
