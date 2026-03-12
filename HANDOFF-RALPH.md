# Ralph Setup Handoff Brief

You are setting up **Ralph** — a workspace instance of KEET, a local-first coding agent orchestrator for Telegram/Discord.

## What This Repo Is

KEET orchestrates AI agents via chat (Telegram/Discord). It classifies incoming messages, routes them through planning/execution pipelines, and runs tasks in containerized isolation. The compiled app lives in `dist/`, the container agent runner lives in `agent-runner/`.

## What You Need To Do

### 1. Install Dependencies
```bash
npm install
```

### 2. Create `.env` File
Copy from `.env.example` if it exists, otherwise create `.env` with at minimum:

**Required:**
- `TELEGRAM_BOT_TOKEN` — from BotFather (or `DISCORD_BOT_TOKEN` for Discord)
- At least one AI provider key:
  - `CLAUDE_API_KEY` (Anthropic)
  - `OPENROUTER_API_KEY`
  - `DASHSCOPE_API_KEY` (default provider)
  - `DEEPSEEK_API_KEY`
- `PRIMARY_PROVIDER` — set to whichever provider you have a key for (default: `dashscope`)

**Recommended:**
- `KEET_DEPLOYMENT_PROFILE=orchestrator-only` (skip container requirements on Mac)
- `GLOBAL_DAILY_BUDGET_USD` — set a spending cap
- `AGENT_DEFAULT_MODE=eco` — start cheap while testing

### 3. Workspace Vault
Create a `vault.env` in the workspace directory with any credentials the agent needs during task execution. These get passed in-memory to containers (never exposed as process env vars).

### 4. Worksheets
The owner will provide worksheets to load. These define project-specific context and configuration. Wait for them before proceeding with worksheet-dependent setup.

### 5. Verify
```bash
npm run doctor    # checks runtime readiness
npm run build     # compiles TypeScript
npm run dev       # starts the bot
```

## Architecture Quick Reference

- **Direct lane**: handles simple intents locally (no container needed)
- **Container lane**: isolates complex tasks in Docker/Apple containers
- **CoPaw lane**: external orchestration bridge (feature-flagged, not needed for basic setup)
- **Control API**: `GET /api/health`, `GET /api/readiness` for status
- **Database**: SQLite via better-sqlite3
- **Provider routing**: resolved through `keet-provider-config.ts`

## Key Config Knobs

| Variable | What it does |
|---|---|
| `KEET_DEPLOYMENT_PROFILE` | `full-execution` (needs containers) or `orchestrator-only` |
| `PRIMARY_PROVIDER` | Which AI provider to route to by default |
| `AGENT_DEFAULT_MODE` | `eco` / `standard` / `pro` / `auto` |
| `STD_BRAIN_MODEL` | Override default model for standard mode |
| `COPAW_ENABLED` | `false` to disable CoPaw bridge entirely |

## Do NOT

- Try to set up containers until the base bot is running and tested
- Modify files in `dist/` — that's compiled output
- Expose API keys in env vars to containers — use `vault.env`
- Enable CoPaw or Trigger.dev until basic chat flow works

## Node Version
Requires Node >= 20. Tested on Node 22.
