# Ralph — Autonomous Agent Factory

> Claude plans. Qwen workers execute. You sleep.

Ralph is a PRD-driven overnight loop that finishes unfinished agent projects autonomously. Each loop: Claude reads the next story, plans it, dispatches execution to Alibaba Coder Lite workers via Maestro subagents, runs tests, and only commits clean passing code. When all stories are done, it stops and prints `FACTORY COMPLETE`.

---

## What's Being Built (the three projects)

| Repo | What it does | When it finishes |
|---|---|---|
| `qwencode-gemini-cli-fork/` | Claude planner + Maestro subagent spawning + Alibaba Qwen workers | First 1–3 hours |
| `custom-orchestrator-agent/` | Takes high-level tasks → breaks into micro-tasks → dispatches via the CLI | Mid-night |
| `agent-management-hub/` | Paperclip AI Hub + Trigger.dev + Mastra dashboard tracking all runs | Final hours |

Each project bootstraps the next. The hub tracks its own creation.

---

## Prerequisites

```bash
# Claude Code CLI (uses your Claude Pro quota)
npm install -g @anthropic-ai/claude-code
claude login   # or: export ANTHROPIC_API_KEY=sk-ant-...

# jq (required for PRD parsing)
brew install jq        # macOS
apt install jq         # Linux

# Your existing API keys in environment
export ALIBABA_API_KEY=...    # Alibaba Coder Lite (~18k req/mo flat fee)
export DEEPSEEK_API_KEY=...   # DeepSeek (hard-capped at $10 total)
```

---

## Setup (< 15 minutes)

```bash
# 1. Clone this repo into place (if not already)
git clone <your-botkeets-repo> ~/my-agent-factory
cd ~/my-agent-factory/ralph

# 2. Drop your three existing forks into the project dirs
cp -r ~/path/to/qwencode-gemini-cli-fork   ./qwencode-gemini-cli-fork/
cp -r ~/path/to/custom-orchestrator-agent  ./custom-orchestrator-agent/
cp -r ~/path/to/agent-management-hub       ./agent-management-hub/

# 3. Verify prd.json looks right (stories should match your actual projects)
cat prd.json

# 4. Make the script executable (already done if you cloned fresh)
chmod +x scripts/ralph/ralph.sh

# 5. Dry-run check (prints first story, doesn't execute)
./scripts/ralph/ralph.sh --help 2>/dev/null || echo "Ready."
```

---

## Running It (then go to sleep)

```bash
cd ~/my-agent-factory/ralph
./scripts/ralph/ralph.sh 300   # 300 loops = plenty for one night
```

That's it. Leave the terminal open and go to sleep.

> **Note:** The script runs with `--dangerously-skip-permissions` so Claude can edit files, run bash commands, and commit without pausing for your approval. This is required for unattended runs — only use this on your local machine or a trusted sandbox.

**Tail the log from another terminal if you want to watch:**
```bash
tail -f ~/my-agent-factory/ralph/ralph.log
```

---

## What Happens While You Sleep

```
Hours 1–3   → Story 1: finishes qwencode CLI fork (your foundation)
              Claude plans → Qwen workers execute → tests pass → committed

Hours 3–6   → Story 2: finishes custom orchestrator
              Uses the now-working CLI to dispatch its own micro-tasks

Hours 6–8   → Story 3: finishes Paperclip + Trigger.dev + Mastra hub
              Dashboard goes live, hooks into orchestrator + CLI
              Hub logs its own construction run history

Morning     → ralph.log shows FACTORY COMPLETE
```

---

## Safety & Scope Controls

| Control | How it works |
|---|---|
| **No context rot** | Fresh Claude session every loop — zero drift or bloat |
| **No scope creep** | PRD-driven — Claude only works on the current story |
| **No broken commits** | Tests must pass before `git commit` runs |
| **No runaway costs** | Alibaba Lite handles all volume (flat fee). DeepSeek capped in prompt. Claude only plans. |
| **No silent failures** | On non-zero exit, loop stops and logs the error. Rerun to resume. |
| **Resumable** | `prd.json` tracks done stories — rerunning skips completed work |

---

## Morning After Checklist

```bash
# 1. Check commit history in each repo
git log --oneline ralph/qwencode-gemini-cli-fork/
git log --oneline ralph/custom-orchestrator-agent/
git log --oneline ralph/agent-management-hub/

# 2. Confirm all stories marked done
cat ralph/prd.json | jq '.done'

# 3. Open the hub dashboard → shows full execution history of its own creation

# 4. Run a smoke test through the full stack
# (see agent-management-hub/README.md for the test agent command)

# 5. Light polish needed? One manual session:
#    claude  →  "Fix anything flagged in ralph.log"
```

---

## Project Layout

```
ralph/
├── README.md                       # This file
├── CLAUDE.md                       # Ralph system prompt (rules for the agent)
├── prd.json                        # Stories + done tracking
├── ralph.log                       # Live loop output (created on first run)
├── scripts/ralph/
│   └── ralph.sh                    # The loop runner
├── qwencode-gemini-cli-fork/       # Story 1: Claude planner + Qwen workers
├── custom-orchestrator-agent/      # Story 2: micro-task dispatcher
└── agent-management-hub/           # Story 3: Paperclip + Trigger.dev + Mastra
```

---

## Cost Breakdown

| Service | Role | Cost |
|---|---|---|
| Claude Pro Max | Planning only (no execution loops) | Existing sub |
| Alibaba Coder Lite | All execution workers via Maestro | ~18k req/mo flat fee |
| DeepSeek | Final verify/diff checks only | Hard-capped at $10 total |

Zero new subscriptions required.

---

## Optional Upgrades (only after this works)

- **Goose** — nicer desktop UI for watching runs
- **Parallel instances** — run three Ralph loops simultaneously for speed (one per story)
- **Custom agent hook** — wire the hub into your own orchestrator for even more automation
- **Slack/webhook notify** — add a `curl` to `ralph.sh` after `mark_done` to ping you on story completion
