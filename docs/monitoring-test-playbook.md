# AGENTKEETS Monitoring Test Playbook

> Reusable prompts to verify every critical path of the agent. Run after every deploy, code change, or whenever things feel off.

---

## How to Use

1. Send each prompt via Telegram (or Discord) to the registered bot
2. Check the **Expected Behavior** column for pass/fail
3. Log results in the tracker table at the bottom
4. Run the full suite after deploys; run individual sections for targeted checks

---

## T1 — CLASSIFICATION & ROUTING

These test whether the intent classifier correctly routes messages.

### T1.1 — Social/Greeting (should NOT spawn container)
```
hey keet, how's it going?
```
**Expected:** Instant reply from local model (nanbeige/smollm2). No container. No planning. Response in <3s.

### T1.2 — Chat/Conversational (should NOT spawn container)
```
What do you think about the new MacBook Pro?
```
**Expected:** Local model reply. No container. Casual tone. <5s.

### T1.3 — Business/Analytics (should NOT spawn container)
```
Can you help me understand my Google Ads ROAS this quarter?
```
**Expected:** Routes to Claude API directly (business class). No container spawn. Domain-aware response.

### T1.4 — Complex/Code (SHOULD spawn container)
```
Write a Python script that fetches the top 10 Hacker News stories and saves them to a JSON file
```
**Expected:** Classified as complex. Planning phase triggers (qwen3:8b). Subtasks generated. Container spawns. Progress updates in chat.

### T1.5 — Edge Case: Looks complex but isn't
```
Can you write me a thank you note for my colleague?
```
**Expected:** Should NOT spawn container. "write" keyword might trigger false positive. Acceptable if it goes to chat/direct path. Flag if container spawns for a thank-you note.

### T1.6 — Edge Case: Short complex request
```
debug this
```
**Expected:** May classify as complex due to "debug" keyword. Without context, should either ask for clarification or treat as chat. Flag if container spawns with no code context.

---

## T2 — OVERRIDE TAGS

### T2.1 — Force autonomous mode
```
!auto Write a bash script that monitors disk usage and sends an alert when above 90%
```
**Expected:** Skips structured mode entirely. Goes straight to autonomous execution. Single container invocation with full freedom. No step-by-step.

### T2.2 — Force eco mode
```
!eco What's the capital of France?
```
**Expected:** Routes to local/cheap model. Zero cloud API cost. Fast response.

### T2.3 — Force pro mode
```
!pro Review this architecture decision: should we use PostgreSQL or DynamoDB for our event sourcing system?
```
**Expected:** Routes to premium model (Claude/DeepSeek R1). Higher quality response. Higher cost.

### T2.4 — Skip plan approval
```
!fast Create a simple Express.js hello world server
```
**Expected:** Plans task but skips the approval gate. Goes straight to execution after planning. No clarification pause.

### T2.5 — Drip feed activation
```
!drip Build a REST API with user registration, login, profile CRUD, and password reset endpoints
```
**Expected:** Drip-feed micro-task execution activates. Each subtask executed individually. Progress updates per step.

### T2.6 — Plan mode (show plan, wait for approval)
```
!plan Refactor the authentication system to use JWT instead of sessions
```
**Expected:** Shows plan with interactive UI (model picker, budget selector). Waits for user approval before executing. No container until approved.

### T2.7 — Combined overrides
```
!pro !fast Write comprehensive unit tests for the user service module
```
**Expected:** Pro model + skip plan approval. Both flags respected. Premium model, immediate execution.

---

## T3 — PLANNING & CLARIFICATION

### T3.1 — Task that needs clarification
```
Set up a database for the project
```
**Expected:** Planner generates clarification questions (e.g., "Which database? PostgreSQL, MySQL, SQLite?", "What tables?"). Bot pauses and asks. Waits for user reply.

### T3.2 — Resume with !go (accept defaults)
After T3.1 pauses for clarification:
```
!go
```
**Expected:** Resumes execution with default answers (first option for each question). No further clarification. Proceeds to container execution.

### T3.3 — Resume with explicit answers
After a clarification pause:
```
scope: frontend only
timeline: 2 weeks
```
**Expected:** Parses `id: answer` format. Applies answers to plan. Resumes execution.

### T3.4 — Complex multi-step task (12+ subtask cap test)
```
Build a complete e-commerce platform with user auth, product catalog, shopping cart, checkout with Stripe, order history, admin dashboard, email notifications, and deployment scripts
```
**Expected:** Planner caps at 12 subtasks maximum. Should decompose intelligently, not lose critical steps. Plan shown if not using !fast.

### T3.5 — Clarification TTL expiry (30 min)
After T3.1 pauses for clarification, wait 30+ minutes, then send:
```
Actually, use PostgreSQL
```
**Expected:** Clarification expired. Message treated as new input (not a clarification answer). Fresh classification and planning cycle.

---

## T4 — TASK EXECUTION

### T4.1 — Structured mode success
```
Create a file called hello.txt with the content "Hello World" in it
```
**Expected:** Structured mode. Single step. Creates file. Reports success. No escape hatch trigger.

### T4.2 — Escape hatch trigger
```
Connect to the Mars Rover API at mars.nasa.gov/api/v2 and download the latest panorama image
```
**Expected:** Structured steps will fail (API doesn't exist). After 3 step failures, escape hatch triggers. Silent switch to autonomous mode. Autonomous mode may also fail, but the MODE SWITCH is what we're testing.

### T4.3 — Progress reporting
```
!auto Write a Node.js CLI tool that converts CSV files to JSON with column type inference
```
**Expected:** Progress updates appear in chat during execution. Telegram: debounced edits (not spam). Discord: thread updates. Final completion message posted.

### T4.4 — Budget enforcement
```
!pro Analyze every file in a large codebase and generate a complete documentation site
```
**Expected:** Budget enforcement kicks in. If task exceeds MAX_TASK_CALLS (default 40), get BUDGET_EXCEEDED error. Task should not run indefinitely.

---

## T5 — PR AUTOMATION & MONITORING

### T5.1 — PR creation (requires git remote workspace)
```
!fast Create a new utility function in a git-initialized workspace that formats dates in ISO 8601
```
**Expected:** After successful execution with commits, PR automation triggers. `gh pr create --fill` runs. PR URL reported in chat. Task status → `pr_open`.

### T5.2 — Monitor CI status
After T5.1 creates a PR, wait for next monitor cycle (10 min):
**Expected:** Monitor checks `gh pr checks`. If CI passes → status `ci_passed` + notification. If CI fails → warning notification. If pending → no action, rechecked next cycle.

### T5.3 — Stale task detection
Start a task that hangs or takes >40 minutes:
**Expected:** After 40+ minutes, monitor sends stale warning: "Task still running after X min". Warning repeats every 10 min cycle.

---

## T6 — INFRASTRUCTURE HEALTH

### T6.1 — Ollama availability
```bash
# From terminal — kill Ollama, then send a message:
curl -s http://localhost:11434/api/tags | head -1
```
Send via Telegram:
```
What's 2 + 2?
```
**Expected:** Classification falls back to rule-based regex. Planning uses generic 3-step fallback. Agent continues working (degraded, not dead). Check logs for "rule-based fallback" entries.

### T6.2 — Build health check
```bash
npm run build && npm run typecheck && npm test
```
**Expected:** All three pass cleanly. Zero type errors. All tests green.

### T6.3 — Container runtime check
```bash
# Docker:
docker images | grep nanoclaw-agent
# Apple container runtime:
container list 2>/dev/null || echo "No Apple container runtime"
```
**Expected:** Container image exists and is recent. Runtime is functional.

### T6.4 — Database integrity
```bash
sqlite3 store/messages.db "PRAGMA integrity_check; SELECT count(*) FROM messages; SELECT count(*) FROM registered_groups; SELECT count(*) FROM chats;"
```
**Expected:** `ok` from integrity check. Non-zero message count. At least 1 registered group.

### T6.5 — Active tasks health
```bash
cat active-tasks.json | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const t=JSON.parse(d);const s=Object.values(t);console.log('Total:',s.length,'Running:',s.filter(x=>x.status==='running').length,'Failed:',s.filter(x=>x.status==='failed').length,'Done:',s.filter(x=>x.status==='done').length)"
```
**Expected:** No perpetually "running" tasks older than 1 hour. Failed tasks should have been investigated. Done tasks pruned after 7 days.

### T6.6 — Sidecar classifier health
```bash
curl -s http://localhost:8765/classify -X POST -H 'Content-Type: application/json' -d '{"text":"hello"}' | head -1
```
**Expected:** Returns JSON with route and score. If unavailable, Ollama fallback should work (tested in T6.1).

---

## T7 — CHANNEL INTEGRATION

### T7.1 — Telegram /ping
```
/ping
```
**Expected:** Bot replies "keet is online" (or configured ASSISTANT_NAME). Confirms Telegram connection alive.

### T7.2 — Telegram /chatid
```
/chatid
```
**Expected:** Returns `tg:<numeric_id>` format. Shows chat type and name.

### T7.3 — Telegram message splitting (long response)
```
!pro List all HTTP status codes from 100 to 599 with their meanings
```
**Expected:** Response exceeds 4096 chars. Bot splits into multiple messages automatically. No truncation.

### T7.4 — Discord thread creation
(Send via Discord channel):
```
!auto Write a Python script that generates a random maze
```
**Expected:** Discord creates a thread on the triggering message. Progress updates posted to thread. Final result posted to main channel.

### T7.5 — Group trigger requirement
(Send in a registered GROUP without @mention):
```
Write a hello world script
```
**Expected:** Bot ignores message (no trigger pattern matched). No response. No processing.

Then send:
```
@keet Write a hello world script
```
**Expected:** Bot processes message. Trigger pattern matched. Normal flow begins.

---

## T8 — ERROR HANDLING & RECOVERY

### T8.1 — Invalid override tag
```
!invalid Write something
```
**Expected:** Unknown tag ignored. Message processed normally without the tag. No crash.

### T8.2 — Empty message after trigger
```
@keet
```
**Expected:** Handled gracefully. Either asks "What can I help with?" or ignores. No crash.

### T8.3 — Rapid-fire messages (rate limit)
Send 10 messages within 5 seconds:
```
test 1
test 2
...
test 10
```
**Expected:** Messages grouped by JID in single poll cycle. No duplicate processing. Queue manages concurrency. No Telegram rate limit errors.

### T8.4 — Process restart recovery
```bash
# Kill and restart the agent:
pm2 restart keet
```
Then check:
```bash
cat active-tasks.json | jq '.[] | select(.status == "running")'
```
**Expected:** Any previously "running" tasks marked as "failed" on restart (stale recovery). Clarification state persists on disk. Agent resumes polling normally.

---

## Run Tracker

| Test | Date | Result | Notes |
|------|------|--------|-------|
| T1.1 Social | | PASS/FAIL | |
| T1.2 Chat | | PASS/FAIL | |
| T1.3 Business | | PASS/FAIL | |
| T1.4 Complex | | PASS/FAIL | |
| T1.5 Edge: write | | PASS/FAIL | |
| T1.6 Edge: debug | | PASS/FAIL | |
| T2.1 !auto | | PASS/FAIL | |
| T2.2 !eco | | PASS/FAIL | |
| T2.3 !pro | | PASS/FAIL | |
| T2.4 !fast | | PASS/FAIL | |
| T2.5 !drip | | PASS/FAIL | |
| T2.6 !plan | | PASS/FAIL | |
| T2.7 Combined | | PASS/FAIL | |
| T3.1 Clarification | | PASS/FAIL | |
| T3.2 !go resume | | PASS/FAIL | |
| T3.3 Explicit answers | | PASS/FAIL | |
| T3.4 12-step cap | | PASS/FAIL | |
| T3.5 TTL expiry | | PASS/FAIL | |
| T4.1 Structured | | PASS/FAIL | |
| T4.2 Escape hatch | | PASS/FAIL | |
| T4.3 Progress | | PASS/FAIL | |
| T4.4 Budget | | PASS/FAIL | |
| T5.1 PR creation | | PASS/FAIL | |
| T5.2 CI monitor | | PASS/FAIL | |
| T5.3 Stale detect | | PASS/FAIL | |
| T6.1 Ollama down | | PASS/FAIL | |
| T6.2 Build health | | PASS/FAIL | |
| T6.3 Container | | PASS/FAIL | |
| T6.4 DB integrity | | PASS/FAIL | |
| T6.5 Active tasks | | PASS/FAIL | |
| T6.6 Sidecar | | PASS/FAIL | |
| T7.1 /ping | | PASS/FAIL | |
| T7.2 /chatid | | PASS/FAIL | |
| T7.3 Msg split | | PASS/FAIL | |
| T7.4 Discord thread | | PASS/FAIL | |
| T7.5 Group trigger | | PASS/FAIL | |
| T8.1 Invalid tag | | PASS/FAIL | |
| T8.2 Empty msg | | PASS/FAIL | |
| T8.3 Rapid fire | | PASS/FAIL | |
| T8.4 Restart recovery | | PASS/FAIL | |

---

## Quick Smoke Test (5 min)

Run these 5 tests for a fast health check after any deploy:

1. **T7.1** — `/ping` (bot alive?)
2. **T1.1** — `hey keet` (classification working?)
3. **T1.4** — `Write a Python hello world script` (full pipeline?)
4. **T6.2** — `npm run build && npm run typecheck && npm test` (code healthy?)
5. **T6.4** — SQLite integrity check (data intact?)

If all 5 pass, the system is operational.

---

## Weekly Deep Check

Run the full T1–T8 suite weekly. Pay special attention to:
- T4.4 (budget enforcement) — ensure no runaway costs
- T5.3 (stale tasks) — ensure no zombie containers
- T6.5 (active tasks) — prune old entries
- T8.4 (restart recovery) — ensure crash resilience
