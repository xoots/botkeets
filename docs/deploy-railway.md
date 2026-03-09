# Railway Deployment (Scoped Orchestrator)

Recommended profile: `orchestrator-only`.

This is a scoped deployment for control/orchestration surfaces, not full host execution.

## Explicit constraints

Supported:
- Control server APIs (`/api/health`, `/api/readiness`, metrics, budgets, tasks)
- Orchestrator routing and policy surfaces
- CoPaw UI/state and agent proxy endpoints when a reachable sidecar exists

Unsupported in this profile:
- Local container execution lane requiring host runtime + `CONTAINER_IMAGE`
- Treating missing local container runtime as a readiness blocker

## Env contract

```bash
KEET_DEPLOYMENT_PROFILE=orchestrator-only
KEET_REQUIRE_CONTAINER_RUNTIME=false
KEET_REQUIRE_AGENT_IMAGE=false
KEET_REQUIRE_CLASSIFIER_SIDECAR=true
KEET_REQUIRE_COPAW_SIDECAR=false
```

Optional (if you provide a sidecar reachable from Railway):

```bash
COPAW_BASE_URL=https://<your-copaw-sidecar>
KEET_REQUIRE_COPAW_SIDECAR=true
```

## Process model

- Primary process: KEET control/orchestrator app
- Optional sidecars: externalized classifier and CoPaw adapter services
- Use `docker-compose.railway-lite.yml` as a local reference for this reduced topology

## Validation

Run:

```bash
npm run doctor
curl -s "$RAILWAY_PUBLIC_DOMAIN/api/readiness"
```

Expect `deployment.profile` to be `orchestrator-only`, with container-runtime checks not treated as hard blockers.
