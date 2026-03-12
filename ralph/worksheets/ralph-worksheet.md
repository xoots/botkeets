# Ralph Loop Worksheet
> Fill this out before your overnight run. Claude will use it to update prd.json, CLAUDE.md, and ralph.sh.

---

## 1. Your Three Projects

### Project 1 — CLI Fork
**Repo location on your machine:**
```
~/
```

**What's already done in this repo:**
```
(e.g. Claude integration wired up, Maestro fork cloned, Qwen key works in .env)
```

**What's NOT done / broken / missing:**
```

```

**How you know it's working (acceptance test):**
```
(e.g. run `node cli.js "write hello world"` and Qwen executes it, Claude planned it)
```

**Any specific files Ralph must NOT touch:**
```

```

---

### Project 2 — Custom Orchestrator
**Repo location on your machine:**
```
~/
```

**What's already done:**
```

```

**What's NOT done / broken / missing:**
```

```

**How you know it's working (acceptance test):**
```

```

**Any specific files Ralph must NOT touch:**
```

```

---

### Project 3 — Agent Management Hub
**Repo location on your machine:**
```
~/
```

**What's already done:**
```

```

**What's NOT done / broken / missing:**
```

```

**How you know it's working (acceptance test):**
```
(e.g. open localhost:3000, see dashboard with live agent runs)
```

**Any specific files Ralph must NOT touch:**
```

```

---

## 2. API Keys & Environment

**ANTHROPIC_API_KEY set in env?**
- [ ] Yes, already exported
- [ ] No — I'll export it before running

**ALIBABA_API_KEY (Coder Lite) set in env?**
- [ ] Yes
- [ ] No — key is: `(paste here, Claude will add it to the setup)`

**DEEPSEEK_API_KEY set in env?**
- [ ] Yes
- [ ] No

**Any other keys the repos need (e.g. GitHub token, DB connection, etc.):**
```

```

---

## 3. Loop Behavior

**How many loops tonight?**
```
300  (default — change if you want fewer)
```

**Should Ralph stop on first blocked story or skip and continue?**
- [ ] Stop on block (default — safe, you fix it manually)
- [ ] Skip blocked story, move to next

**Max time per story before timeout (minutes):**
```
10  (default — change if your stories are complex)
```

**Should Ralph run tests before committing?**
- [ ] Yes, always (default)
- [ ] No tests exist yet — just commit if code runs

**Test command for each project (leave blank if none):**
```
Project 1: npm test
Project 2:
Project 3:
```

---

## 4. Git Settings

**Base branch Ralph should branch from:**
```
main
```

**Commit message prefix (default: [ralph]):**
```
[ralph]
```

**Should Ralph push to remote after each story?**
- [ ] Yes, push after each story
- [ ] No, local commits only (push manually in the morning)

---

## 5. Priorities & Constraints

**If Ralph can only finish one project tonight, which matters most?**
```
1 > 2 > 3  (default order — change if needed)
```

**Anything you absolutely do NOT want Ralph to change:**
```
(e.g. don't touch package-lock.json, don't upgrade dependencies, don't change the DB schema)
```

**Any known landmines / gotchas in the repos:**
```
(e.g. "the Maestro fork has a broken test in __tests__/spawn.test.js, ignore it")
```

---

## 6. Morning Handoff

**What does "done" look like to you tomorrow morning?**
```
(e.g. all three CLIs run without errors, dashboard loads, I can dispatch one real task end-to-end)
```

**Anything you want Ralph to leave a note about in ralph.log:**
```
(e.g. "flag any TODOs you left for me", "note which Qwen model worked best")
```
