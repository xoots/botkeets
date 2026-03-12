# Agent Factory Validation & Optimization Research
Goal: Run exactly 10 bounded validation experiments on the full my-agent-factory stack (qwencode-cli-fork + custom-orchestrator + agent-management-hub + Goose integration). Make it better on every measurable dimension without ever touching production code or adding features.

Rules (never break these):
- Fixed budget: MAX 10 experiments. Stop when done or budget reached.
- Each experiment: Run one short validation suite (tests + cost benchmark + security scan + drift check). Max 5 minutes wall-clock per run.
- Success metric per experiment (must improve or tie the previous best):
  - Tests: 100% pass + coverage >= 85%
  - Cost: Total run cost <= $0.01 using Qwen worker (Alibaba Lite)
  - Security: Zero high/medium vulnerabilities (use built-in scan)
  - Drift/Scope: Zero new files outside the three repos + prd.json still matches
- Use ONLY Qwen 3.5 Plus / Qwen3 Coder Plus (Alibaba Lite) or DeepSeek for execution. Claude only for planning the next experiment.
- 3-attempt rule: If an experiment fails 3 times, skip and log — never retry forever.
- Git discipline: Work on exp/validation-{number}-{date}. Commit ONLY on metric improvement. Never merge to main.
- Shared log: Append to VALIDATION_LOG.md in this exact format after every experiment:
  [EXPERIMENT #N] · {timestamp}
  Metric before → after
  Changes made (files + why)
  Commits
  Blockers / skipped
  Recommendations for next

Workflow for every experiment:
1. Read prd.json + all three repos + Goose config + previous log.
2. Plan one targeted validation tweak (test config, Qwen routing, subagent spawn, hub dashboard, etc.).
3. Implement the tweak in a branch.
4. Run the full validation suite.
5. If metric improved → keep it. Else revert.
6. Append to VALIDATION_LOG.md and commit.

After experiment 10 (or earlier if no more improvements):
- Run the synthesis agent: Read the entire VALIDATION_LOG.md.
- Update README.md in my-agent-factory with final status.
- Output exactly:
  - Top 3 recommended next human actions
  - Any human decisions needed
  - Final overall score (tests, cost, security, drift)
- Say "RESEARCH COMPLETE — 10 experiments finished" and stop.

Start now. First action: Create the blank VALIDATION_LOG.md and run experiment #1.
