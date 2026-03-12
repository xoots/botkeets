# Goose Worksheet
> Fill this out before opening Goose tonight. Claude will use it to update the monitoring prompt and Goose config.

---

## 1. Goose Install

**Have you installed Goose Desktop?**
- [ ] Yes, already installed
- [ ] No — I'll run `brew install --cask block-goose` tonight

**Goose version (check Help → About):**
```

```

---

## 2. Provider Setup

### Anthropic (Claude — lead/planner)
**API key already added to Goose?**
- [ ] Yes
- [ ] No — I'll paste it on first launch

### Alibaba Qwen Lite (worker/executor)
**API key:**
```
(paste here so Claude can pre-fill the config if needed)
```

**Which region are you in?**
- [ ] Outside China → use `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- [ ] Inside China → use `https://dashscope.aliyuncs.com/compatible-mode/v1`

**Which Qwen models do you want available? (check all that apply)**
- [ ] qwen3-coder-plus (recommended default worker)
- [ ] qwen3.5-plus
- [ ] qwen-plus
- [ ] qwen3-coder

### DeepSeek (cheap verify only)
**API key:**
```

```

**Hard spend cap for the whole night ($):**
```
5
```

---

## 3. Folder & Workspace

**Path to your agent factory on this machine:**
```
~/my-agent-factory
```

**Should Goose have write access to any files tonight?**
- [ ] No — read-only monitor only (default, safest)
- [ ] Yes, allow writes to: ___________

---

## 4. Monitoring Preferences

**How often should Goose report progress?**
- [ ] Every 30 minutes (default)
- [ ] Every hour
- [ ] Only on story completion

**Where should Goose write its log?**
```
ralph/goose/goose.log  (default)
```

**Should Goose run tests in parallel while Ralph builds?**
- [ ] Yes — run tests on completed stories using Qwen only
- [ ] No — just watch and report

**If Goose spots something broken in a completed story, should it:**
- [ ] Log it and tell me in the morning (default — safe)
- [ ] Attempt a fix with Qwen (only check this if you trust it fully)

---

## 5. Notifications

**Do you want Goose to ping you if something goes wrong?**
- [ ] No — I'll check the log in the morning
- [ ] Yes — via: _____________ (Slack / email / SMS / other)

**Alert threshold:**
- [ ] Any error
- [ ] Only if Ralph fully stops/crashes

---

## 6. Morning Session

**First thing you want Goose to do when you wake up:**
```
(default: "Review all commits, run full test suite with Qwen, open hub dashboard, fix polish with Qwen3 Coder Plus only")
```

**Which model should Goose use for morning polish?**
- [ ] Qwen3 Coder Plus only (cheapest — recommended)
- [ ] Claude lead + Qwen worker
- [ ] Claude only

**Anything Goose should specifically check or validate in the morning:**
```
(e.g. "make sure the Maestro spawn works end-to-end", "check the hub dashboard loads on port 3000")
```
