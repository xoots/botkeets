# VPS Deployment (Full Execution)

Recommended profile: `full-execution`.

## Prerequisites

- Ubuntu/Debian VPS with Docker engine running
- Node.js 20+
- Python 3.11+ (for local CoPaw adapter sidecar)
- Repo checkout including `CoPaw-upstream/`

## Env setup

Use `.env` with at least:

```bash
KEET_DEPLOYMENT_PROFILE=full-execution
KEET_REQUIRE_CONTAINER_RUNTIME=true
KEET_REQUIRE_AGENT_IMAGE=true
KEET_REQUIRE_CLASSIFIER_SIDECAR=true
KEET_REQUIRE_COPAW_SIDECAR=true
CONTAINER_RUNTIME_TYPE=docker
KEET_CONTAINER_RUNTIME_BIN=docker
COPAW_SOURCE_DIR=./CoPaw-upstream
```

Set your provider keys and `KEET_ADMIN_TOKEN` as needed.

## Startup (Docker Compose)

```bash
cp .env.example .env
# edit .env

docker build -t nanoclaw-agent:latest .
docker compose up -d
npm run doctor
```

Control API readiness:

```bash
curl -s http://127.0.0.1:8766/api/readiness | jq '.deployment'
```

## Startup (Host + PM2)

```bash
npm ci
npm run build
npm run pm2:start
npm run doctor
```

## Operational notes

- CoPaw circuit state is in-memory and resets on process restart.
- CoPaw lane currently uses adapter `/run` single-step payload shaping.
- `POST /api/copaw/circuit/reset` is still non-live and not exposed as an active endpoint.
