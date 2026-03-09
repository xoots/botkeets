# Dependency Pinning Policy

## CoPaw upstream pin

Source of truth files:
- `copaw-adapter/COPAW_UPSTREAM_PIN.txt`
- `.env` (`COPAW_UPSTREAM_PIN`, optional override)

Pin format:
- `agentscope-ai/CoPaw@<git-commit-sha>`

Current pinned value:
- `agentscope-ai/CoPaw@ce20d01c02edab030e910bd1584274a88b42ebb9`

## Update policy

1. Pick a specific upstream commit SHA.
2. Update `copaw-adapter/COPAW_UPSTREAM_PIN.txt`.
3. Update `.env` only if you need an environment override.
4. Run:
   - `npm run doctor` (pin/path checks)
   - `npm run typecheck`
   - `npm run test`
5. Record compatibility notes in PR description (breaking API changes, adapter shape changes, migration steps).

## Guardrails

- Do not use floating tags (`main`, `latest`, or unpinned refs).
- Keep pin updates atomic with adapter contract changes.
