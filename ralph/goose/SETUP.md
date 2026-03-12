# Goose Desktop Setup (alongside Ralph)

Goose runs on your Mac as a live visual monitor while Ralph runs in the terminal overnight. Ralph owns the code and commits — Goose watches, runs cheap Qwen tests in parallel, and reports progress.

---

## Install (< 5 minutes)

```bash
brew install --cask block-goose
```

Or: download from https://block.github.io/goose/ → unzip → drag to Applications.

Launch from Spotlight or Applications.

---

## Configure Providers (first launch)

On the welcome screen, add **Anthropic** first (paste your `ANTHROPIC_API_KEY`).

Then: **Settings → Models → Add Provider** for each of the two below.

### Provider 1 — Alibaba Qwen Lite (main cheap worker)

| Field | Value |
|---|---|
| Provider Type | OpenAI Compatible |
| Display Name | Alibaba Qwen Lite |
| API URL | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| API Key | Your Alibaba Coder Lite key |
| Models | `qwen3-coder-plus,qwen3.5-plus,qwen-plus,qwen3-coder` |
| Streaming | Enabled |

> Use `https://dashscope.aliyuncs.com/compatible-mode/v1` if inside China.

### Provider 2 — DeepSeek Capped (verify only)

| Field | Value |
|---|---|
| Provider Type | OpenAI Compatible |
| Display Name | DeepSeek Capped |
| API URL | `https://api.deepseek.com` |
| API Key | Your DeepSeek key |
| Models | `deepseek-chat,deepseek-reasoner` |
| Streaming | Enabled |

### Set defaults in the main Models selector

| Role | Model |
|---|---|
| Lead / Planner | Claude (Anthropic) |
| Worker / Executor | Alibaba Qwen Lite |

Enable **Planning Mode** + **Auto-route execution to cheap model**.

---

## Open Your Factory in Goose

**File → Open Folder → `~/my-agent-factory`**

Goose will see all three repos, `prd.json`, the Ralph scripts, and CLAUDE.md.

---

## Running Tonight

```bash
# 1. Pull latest
cd ~/my-agent-factory && git pull

# 2. Start Ralph in terminal
./scripts/ralph/ralph.sh 300

# 3. Open Goose → paste the monitoring prompt (goose/prompts/overnight-monitor.md)

# 4. Go to bed
```

---

## Tomorrow Morning

In Goose, switch Worker model to **Alibaba Qwen Lite only**, then paste the morning prompt (`goose/prompts/morning-review.md`).

---

## Safety Notes

- Goose never overrides Ralph's git commits — it only reads and tests
- DeepSeek capped in prompts to <$5
- Config lives in Goose keychain + `~/.config/goose` — no extra files needed
- Maestro subagent MCP extensions will work once the CLI fork finishes (Story 1)
