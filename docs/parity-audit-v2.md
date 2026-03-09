# KEET Parity Audit (V2.3 Baseline)

Date: 2026-03-03

## Scope
- Runtime and startup behavior
- Credentials and clarification safety
- Control-plane security
- Test/CI baseline
- UI control + observability wiring

## Claim-to-Evidence Map
| Claim | Status | Evidence |
| --- | --- | --- |
| Apple container runtime is default | Implemented | `build.sh` default runtime set to `container`; `CONTAINER_RUNTIME_TYPE=apple` in `.env.example` |
| Classifier startup is portable | Implemented | `classifier/start.sh` uses `python3`/`PYTHON_BIN` instead of hardcoded Homebrew path |
| Runtime doctor checks exist | Implemented | `scripts/doctor.ts`, `npm run doctor` |
| Vault values are propagated to execution | Implemented | `src/task-runner.ts` + `src/container-runner.ts` pass `vaultEnv` to callback/container |
| Raw secrets are not persisted in clarification state | Implemented | `src/clarification-store.ts` stores `vaultKeys` only |
| Control API mutating endpoints are authenticated | Implemented | `src/control-server.ts` uses `X-KEET-ADMIN-TOKEN` for `/api/mode` and `/api/services/*` |
| Startup token matrix is enforced | Implemented | `src/startup-preflight.ts` + `src/index.ts` preflight before boot |
| PM2/runtime env keys are aligned | Implemented (compat mode) | `ecosystem.config.cjs` uses `DISCORD_BOT_TOKEN` and legacy alias |
| Baseline tests exist for critical flows | Implemented | `src/*.test.ts` includes auth, preflight, vault propagation, clarification safety |
| CI gates for build/typecheck/test/docs | Implemented | `.github/workflows/ci.yml` |
| UI is wired to authenticated control endpoints | Implemented | `agent-ui/src/App.jsx` sends auth header for mutating calls |
| UI shows live routing/sqlite metrics | Implemented | `agent-ui/src/App.jsx` polls `/api/metrics/*` + `/api/readiness` |

## Remaining Gaps
### Implement
- Add integration tests that boot the control server and exercise full HTTP request/response behavior.
- Add startup tests validating Discord-only success path and real channel stubs.
- Add redaction guarantees for logs beyond clarification-store (full app log scan test).

### De-scope or roadmap
- Full memory subsystem parity (`docs/memory-context-management.md`) is still partially aspirational.
- Weekly self-improvement policy updater remains design-level in docs.

### Docs rewrite needed
- Some docs still describe Docker-first wording; runtime default is Apple container.
- `.env.example` header still says “Copy this file to AGENT/.env”; for KEET standalone usage this should say `KEET/.env`.

## Decision Summary
- Keep runtime/security changes as shipped in V2.3.
- Treat advanced self-improvement and memory parity as V3 roadmap.
- Update docs to split “implemented now” vs “planned” sections explicitly.
