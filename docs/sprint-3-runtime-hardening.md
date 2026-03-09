# Sprint 3: Runtime Hardening From Upstream Patterns

Date: 2026-03-08

## Objective

Harden KEET runtime behavior using selective upstream patterns without inheriting upstream naming, API shape, or architecture wholesale.

This sprint is about determinism, observability, and stable lifecycle management. It is also the prerequisite for safely removing remaining fork scarring.

Related audit:

- [fork-scarring-audit-20260308](./fork-scarring-audit-20260308.md)

## Ground Rules

- Borrow behavior, not branding.
- KEET owns the public contract even when an upstream pattern informs the implementation.
- Degraded mode must be explicit, deterministic, and observable.
- Session and container lifecycle rules must survive retries and restarts.
- Do not broaden CoPaw or Trigger surface area while this sprint is in flight.

## Sprint Scope

### 1. Context-window guardrails

Make context handling explicit and predictable across direct and container execution.

Deliverables:

- one policy source for compaction, rebase, and hard-stop thresholds
- machine-readable degraded reasons when context limits force behavior change
- consistent operator-visible reporting for context pressure
- tests for below-threshold, compaction, rebase, and hard-stop paths

Likely touchpoints:

- `src/context-manager.ts`
- `src/task-runner.ts`
- `src/direct-runner.ts`
- `src/container-runner.ts`
- `src/reasoning/*`

### 2. Deterministic provider/auth/model fallback

Fallback rules must stop being implicit or split across call sites.

Deliverables:

- a single KEET-owned runtime authority for provider, auth, model, and fallback selection
- ordered fallback chains with no hidden ambient fallback
- emitted decision objects that explain source, fallback path, and final runtime choice
- logs and control-surface diagnostics that show why degraded mode happened

Likely touchpoints:

- `src/runtime-resolver.ts`
- `src/keet-provider-config.ts`
- `src/provider-registry.ts`
- `src/mode-router.ts`
- `src/direct-runner.ts`
- `src/task-runner.ts`

### 3. Session ownership and lifecycle

Workspace/session state must be stable across retries, resumptions, and crashes.

Deliverables:

- one owner for session acquisition, heartbeat, release, and stale recovery
- explicit lease semantics instead of ad hoc release paths
- restart-safe recovery rules for orphaned running work
- tests covering retry, restart, and duplicate-resume scenarios

Likely touchpoints:

- `src/memory-session.ts`
- `src/container-runtime-manager.ts`
- `src/container-runtime-interface.ts`
- `src/container-runner.ts`
- `src/task-runner.ts`

### 4. Sandbox and container lifecycle rules

Container behavior needs a clear contract instead of scattered heuristics.

Deliverables:

- defined rules for create, reuse, idle cleanup, and stale-container cleanup
- separation between session identity and container identity
- deterministic cleanup on success, failure, timeout, and restart
- KEET-native container naming target documented as the post-compat end-state

Likely touchpoints:

- `src/container-runtime.ts`
- `src/apple-container-runtime.ts`
- `src/docker-container-runtime.ts`
- `src/container-runtime-manager.ts`
- `src/container-runner.ts`

### 5. Degraded-mode behavior

The system already degrades in many places, but too much of it is implicit.

Deliverables:

- stable degraded-reason taxonomy shared across runtime layers
- readiness/control responses that surface unavailable capabilities clearly
- operator-facing messages that distinguish fallback, retry, and hard failure
- tests for sidecar-missing, image-missing, provider-missing, and context-hard-stop cases

Likely touchpoints:

- `src/control-server.ts`
- `src/runtime-registry.ts`
- `src/runtime-split.ts`
- `src/config.ts`
- `scripts/doctor.ts`

## Fork-Scarring Rule During Sprint 3

Sprint 3 should reduce scarring, not entrench it.

Rules:

- no new public `nanoclaw`, `copaw`, or `trigger` names
- no new persisted keys or metric labels with old branding
- if compatibility aliases are required, KEET-native names land first and aliases are documented

## Acceptance Criteria

- Runtime fallback behavior is deterministic and explainable from logs/state.
- Context guardrails produce explicit degraded reasons instead of silent behavior changes.
- Session leases survive retry and restart without duplicate ownership.
- Sandbox/container cleanup rules are documented and enforced by code.
- Readiness and control surfaces report degraded mode using stable reason codes.
- Sprint output does not add new fork-branded public surface area.

## Out Of Scope

- wholesale upstream replatforming
- cosmetic repo-wide rename with no contract plan
- removing all CoPaw or Trigger compatibility aliases in the same sprint
- feature expansion unrelated to runtime hardening

## Suggested Execution Order

1. Lock degraded-reason taxonomy and runtime-decision schema.
2. Centralize provider/auth/model fallback authority.
3. Fix session ownership and recovery semantics.
4. Normalize container lifecycle and cleanup rules.
5. Move public/operator docs to the hardened KEET contract.
6. Start alias retirement from the fork-scarring audit.
