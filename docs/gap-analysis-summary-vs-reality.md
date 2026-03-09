# KEET Gap Analysis: Summary Claims vs Repo Reality

**Date:** 2026-03-07
**Method:** 6 parallel subagent audits across all src/, docs/, memory/, data/ directories
**Verdict:** Core memory scoring is real. Parallel subagent orchestration is NOT implemented.

---

## TRAFFIC LIGHT SUMMARY

| Layer | Claim | Status |
|-------|-------|--------|
| Canon scoring formula | alpha=0.50, beta=0.35, gamma=0.15 | **GREEN** - exact match, unit tested |
| HOT/WARM/COLD tiers | >=0.60 / 0.30-0.59 / <0.30 | **GREEN** - exact match |
| Memory session loading | loadMemoryForTask() in pipeline | **GREEN** - wired at 2 call sites |
| Anchor injection into prompts | Top of every subagent prompt | **GREEN** - task-runner.ts injects it |
| Signal emission | Dual-write SQLite + JSONL | **GREEN** - 2 emitters live |
| Budget enforcement | Hierarchical 5-level | **GREEN** - but USD-based, not token-based |
| Two-path execution | Direct vs container | **GREEN** - working |
| Parallel subagent spawning | Promise.allSettled + Trigger | **RED** - NOT IMPLEMENTED |
| CoderBot / ResearchBot / DeployBot | Typed subagent roles | **RED** - DO NOT EXIST |
| Final synthesis from masked returns | Orchestrator combines outputs | **RED** - NOT IMPLEMENTED |
| Mem0 fact extraction | Active in pipeline | **RED** - DEAD CODE (never called) |
| Cognee semantic search | Graph + vector retrieval | **YELLOW** - stub, returns [] if no server |
| 47% / 26% context caps | Enforced dynamically | **YELLOW** - 47% exists in anchor-filter.ts but not integrated with memory-session; 26% does not exist |
| Model tiers (SMALL/MID/FULL) | Execution routing | **YELLOW** - actual tiers are CLAUDE/QWEN_MAX/QWEN_PLUS/QWEN_CODER/DEEPSEEK (memory-only) |
| classify_task() output | agent_type, model_tier, project_id | **RED** - actual output is task_type, complexity, quality_stakes, recommended_mode |

---

## SECTION 1: What Will Hold You Back From Use

### 1.1 BLOCKER: No Parallel Subagent Spawning

**The summary describes the crown jewel feature. It doesn't exist.**

The summary claims:
- Orchestrator builds spawn plan
- Spawns parallel subagents via "Trigger" using `Promise.allSettled` on `SpawnRequest[]`
- CoderBot (SMALL), ResearchBot (MID), DeployBot (SMALL) receive sliced context
- Returns are masked (<500 tokens)
- Final synthesis combines masked returns

**What actually exists:**
- `src/trigger/tasks.ts` — **STUB** that immediately throws `Error("Trigger.dev runtime not configured")`
- `src/trigger/dag-tasks.ts` — **STUB** that immediately throws
- `SpawnRequest` type — **DOES NOT EXIST**
- CoderBot / ResearchBot / DeployBot — **ZERO REFERENCES** in codebase
- Promise.allSettled spawning — **NOT IMPLEMENTED ANYWHERE**
- Final synthesis logic — **NOT IMPLEMENTED**

**What you actually have:** Single-task, sequential execution. One task → one agent → one response. The `memory-subagent-contract.ts` file defines output parsing (`enforceTokenLimits()`, `parseMVPSubagentOutput()`) but these are **validation contracts for future use** — no subagents are spawned to produce these outputs.

**Impact:** The entire "parallel sliced subagents → masked synthesis" pipeline described in the summary is aspirational. Without this, KEET runs as a single-agent system with memory-aware context injection — which is valuable, but fundamentally different from what the summary describes.

### 1.2 BLOCKER: Mem0 Is Dead Code

**The summary claims:** "Mem0 → fact extraction" as part of the active memory stack.

**Reality:** `src/memory-mem0-extractor.ts` exists (calls DashScope API, not actual Mem0) but is **never imported or called anywhere** in the codebase. Zero call sites. Zero imports. It's orphaned code.

**Impact:** There is no fact extraction happening. The memory system relies entirely on:
- Signal emission (frequency/recency data)
- Project index keywords (manual seed)
- Cognee search (which is itself a stub)

Without fact extraction, the system cannot learn new facts from task content. It can only recall what was manually seeded.

### 1.3 BLOCKER: Cognee Returns Empty

**The summary claims:** "Cognee → graph + vector storage/retrieval" as the semantic backend.

**Reality:** `src/memory-cognee-search.ts` calls `http://localhost:8765/search` with a 3-second timeout. If the server is not running (which it won't be unless separately deployed), it silently returns `[]`.

**Impact:** The `alpha` component of canon scoring (semantic similarity, weighted at 0.50 — the LARGEST weight) has no real data to work with. Without embeddings from Cognee:
- `computeAlpha()` returns 0 (no centroid to compare against)
- Canon scores are dominated by recency (beta) and frequency (gamma) only
- HOT/WARM/COLD classification loses its most important signal

The memory system technically runs, but it's running blind on semantics — the biggest weight in the formula.

---

## SECTION 2: Significant Mismatches (Won't Block But Will Confuse)

### 2.1 classify_task() Output Schema Mismatch

**Summary claims:** `classify_task()` outputs `agent_type | model_tier (SMALL/MID/FULL) | project_id`

**Actual ClassifierResult (src/task-classifier.ts):**
```
task_type: 'social'|'chat'|'business'|'research'|'code'|'complex'
complexity: 'low'|'medium'|'high'
quality_stakes: 'low'|'medium'|'high'
recommended_mode: 'eco'|'standard'|'pro'
reasoning: string
```

No `agent_type`. No `model_tier`. No `project_id` (resolved separately in `memory-project-resolver.ts`).

### 2.2 Model Tiers Are Not SMALL/MID/FULL

**Summary uses:** SMALL / MID / FULL throughout

**Actual implementation:**
- Execution routing uses **Mode**: `eco | standard | pro | auto`
- Memory system uses **ModelTier**: `CLAUDE | QWEN_MAX | QWEN_PLUS | QWEN_CODER | DEEPSEEK`
- There is no MID tier anywhere

### 2.3 Token Budgets Are Memory-Only

**Summary implies** token budgets control execution routing.

**Reality:** Token budgets (1500+600 for CLAUDE+HOT, etc.) only control **anchor assembly size** in `memory-anchor-builder.ts`. Task execution budget is enforced in **USD** via `budget-policy.ts` (global → mode → task → shard → escalation hierarchy).

### 2.4 Context Compaction Is Fragmented

**Summary claims:** "max 47% usage before compaction, 26% for small/local models"

**Reality:**
- `anchor-filter.ts` defines `ANCHOR_CAP = 0.47` — but this is **not integrated** with `memory-session.ts`
- 26% threshold for small models **does not exist** in code
- Three independent context management systems coexist:
  1. `anchor-filter.ts` (47% cap, uses js-tiktoken)
  2. `memory-anchor-builder.ts` (tiered token budgets, uses 4-char approximation)
  3. `reasoning/anchor-context.ts` (per-shard context allocation)
- These don't talk to each other

### 2.5 No "canon-engine.ts" File

**Summary references** a centralized `canon-engine.ts`.

**Reality:** Canon scoring is distributed across:
- `memory-canon-score.ts` — math (alpha/beta/gamma)
- `memory-anchor-builder.ts` — tier resolution + anchor assembly
- `memory-session.ts` — orchestration (load → score → assemble → cache)

This is actually better architecture, but doesn't match the summary.

### 2.6 Model Routing Is Outdated

**Summary implies:** claude-opus for execution, nanbeige for social

**Reality:** Dynamic provider selection via `provider-registry.ts`:
- eco: deepseek-chat
- standard: dashscope qwen3.5 variants or deepseek-chat
- pro: deepseek-chat, qwen-plus, or claude-sonnet (if available)
- nanbeige4.1 not referenced in current code

---

## SECTION 3: What IS Real and Working

These parts of the summary are accurate and production-ready:

1. **Canon scoring math** — alpha/beta/gamma with exact weights, unit tested (15 tests)
2. **HOT/WARM/COLD tier assignment** — thresholds match, warmth multipliers applied
3. **Anchor assembly** — dynamic per-model-tier sizing with token budgets
4. **Signal emission** — dual-write (SQLite + JSONL), fire-and-forget via setImmediate
5. **Memory session loading** — `loadMemoryForTask()` called at both `runTask()` sites
6. **Anchor injection** — content prepended to task-runner prompts
7. **Session-level caching** — prefix consistency for DeepSeek (same anchor per session)
8. **Token logging** — memory_token_log table tracks anchor costs
9. **Budget enforcement** — 5-level hierarchical (USD-based)
10. **Two-path execution** — direct-runner (simple) vs container-runner (complex)
11. **Override parsing** — `!auto`, `!eco`, `!pro`, `!go`, `!fast`, `!parallel`
12. **Plan approval gate** — decomposition flagging + concurrency control
13. **Failure taxonomy** — 11 categories with explicit recovery strategies
14. **Verification policy** — artifact check, git diff sanity, test gate, smoke check
15. **101 passing tests** across 10 test files

---

## SECTION 4: Action Items to Close Gaps

### Must-Fix Before Use (Blockers)

| # | Gap | Fix | Effort |
|---|-----|-----|--------|
| 1 | Mem0 extractor is dead code | Wire `extractMem0Facts()` into memory-session.ts or execution-lifecycle.ts; call after task completion to persist learned facts | Medium |
| 2 | Cognee returns [] without server | Either: (a) deploy Cognee as sidecar, (b) replace with local embedding store (e.g., sqlite-vec), or (c) accept alpha=0 and reweight beta/gamma to compensate | Large |
| 3 | No parallel subagent spawn | Implement actual Trigger dispatch or simpler Promise.allSettled wrapper; define SpawnRequest type; build CoderBot/ResearchBot routing | Large |
| 4 | No final synthesis | Build orchestrator synthesis that combines masked subagent returns into unified output | Medium |

### Should-Fix (Correctness)

| # | Gap | Fix |
|---|-----|-----|
| 5 | classify_task() schema mismatch | Either update the summary or add agent_type/model_tier fields to ClassifierResult |
| 6 | Context compaction not unified | Integrate anchor-filter.ts 47% cap check into memory-session.ts anchor assembly |
| 7 | No 26% small-model cap | Decide if needed; if yes, add to anchor-filter or anchor-builder |
| 8 | CLAUDE.md model routing outdated | Update to reflect current provider-registry.ts dynamic routing |

### Nice-to-Have (Polish)

| # | Gap | Fix |
|---|-----|-----|
| 9 | Reranking not implemented | Add lightweight reranking after Cognee returns (e.g., by canon score) |
| 10 | 4-char token estimation vs tiktoken | Consolidate to one method across anchor-builder and anchor-filter |

---

## SECTION 5: One-Line Truth

**KEET today = canon-scoring memory injection into a single-agent sequential execution pipeline, with the parallel multi-agent orchestration layer described in the summary being entirely unbuilt.**

The memory scoring and anchor injection are real, tested, and wired. Everything about parallel subagents, typed bots, Trigger dispatch, and masked synthesis is spec-only. Mem0 is dead code and Cognee is a graceful no-op, meaning the semantic weight (50% of the canon formula) produces no signal.
