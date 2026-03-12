# Autoresearch Worksheet (Karpathy-style)
> Fill this out before kicking off the 10-experiment validation. Claude will use it to update program.md and target the right things.

---

## 1. What to Validate

**Which projects should the autoresearcher cover? (check all)**
- [ ] qwencode-gemini-cli-fork
- [ ] custom-orchestrator-agent
- [ ] agent-management-hub
- [ ] Goose integration / monitoring setup
- [ ] Ralph loop itself (ralph.sh + prd.json)

**Any area you want extra focus on:**
```
(e.g. "really care about the hub dashboard reliability", "Maestro spawn is flaky, dig into that")
```

**Any area to skip entirely:**
```
(e.g. "don't touch the DB migration files", "ignore the legacy v1 endpoints")
```

---

## 2. Success Metrics

**Test coverage target (default: 85%):**
```
%
```

**Max cost per experiment run using Qwen (default: $0.01):**
```
$
```

**Security scan level:**
- [ ] High + Medium vulnerabilities must be zero (default)
- [ ] High only
- [ ] Skip security scan

**Drift check — what counts as "out of scope":**
```
(default: zero new files outside the three repos + prd.json still matches)
(add any extra rules here, e.g. "no new npm dependencies without my approval")
```

---

## 3. Experiment Budget

**Max number of experiments (default: 10):**
```
10
```

**Max wall-clock time per experiment (default: 5 minutes):**
```
minutes
```

**What should happen when budget is exhausted before all experiments pass?**
- [ ] Stop and write final report (default)
- [ ] Keep going until all metrics pass (removes the cap — use carefully)

---

## 4. Models

**Execution worker (default: Qwen3 Coder Plus):**
```
qwen3-coder-plus
```

**Planning model (default: Claude):**
```
claude  (uses your Pro key)
```

**DeepSeek allowed for final verify?**
- [ ] Yes, capped at $____ total
- [ ] No — Qwen only

---

## 5. Git Behavior

**Branch naming for experiments (default: exp/validation-{N}-{date}):**
```

```

**Should experiment branches be deleted after synthesis?**
- [ ] No — keep them all for review (default)
- [ ] Yes — delete passing ones, keep failing ones for debug

**Should any passing experiment be auto-merged to main?**
- [ ] No — I'll review and merge manually (default, safest)
- [ ] Yes, auto-merge if all metrics pass

---

## 6. Output & Reporting

**Where should VALIDATION_LOG.md live:**
```
ralph/goose/autoresearch/VALIDATION_LOG.md  (default)
```

**What format do you want the final synthesis report in?**
- [ ] Markdown summary in VALIDATION_LOG.md (default)
- [ ] Also update the main README.md
- [ ] Both

**Top 3 questions you want the synthesis agent to answer:**
```
1.
2.
3.
```

**Anything specific you want flagged as a "human decision needed":**
```
(e.g. "flag any architectural changes that would need more than a day to implement",
"flag if DeepSeek costs came in over $3")
```

---

## 7. Kick-off Prompt (customize if needed)

> This is what you'll paste into Goose to start the autoresearcher.
> Default is fine — edit only if you want to change the framing.

```
Hi, have a look at program.md and let's kick off a new experiment!
```

**Custom kick-off message (leave blank to use default above):**
```

```
