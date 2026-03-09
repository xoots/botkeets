# KEET Docs Summary

Last updated: 2026-03-06

## Authoritative (Current Runtime)

Use these for real behavior and operational decisions:

- [README](../README.md)
- [ARCHITECTURE](../ARCHITECTURE.md)
- [SPEC](../SPEC.md)
- [Truth Docs](./truth-docs-current.md)
- [Security](./SECURITY.md)
- [Apple Container Networking](./APPLE-CONTAINER-NETWORKING.md)

## Memory System (Normative Implementation Reference)

Active sprint-by-sprint implementation spec for the project-scoped memory system:

- [sprint-prompts-memory-system](../memory/sprint-prompts-memory-system.md) — normative sprint prompts (Sprints 1–12); use as implementation guide
- [implementation-plan-memory-system](../memory/implementation-plan-memory-system.md) — detailed design rationale and file-level specifications
- [MEMORY](../memory/MEMORY.md) — project session memory and architectural decisions

## Active Contracts, Policies, and Roadmaps

- [fork-scarring-audit-20260308](./fork-scarring-audit-20260308.md) — inventory of remaining NanoClaw, CoPaw, and Trigger contract debt
- [sprint-3-runtime-hardening](./sprint-3-runtime-hardening.md) — next runtime hardening phase and exit criteria
- [hybrid-contract-freeze-v1](./hybrid-contract-freeze-v1.md) — Phase 1 contract freeze (46 live routes, deprecated stubs)
- [dependency-pinning](./dependency-pinning.md) — CoPaw upstream pin policy
- [parity-audit-v2](./parity-audit-v2.md) — implementation baseline audit
- [parity-backlog-v3](./parity-backlog-v3.md) — prioritized V3 sprint backlog (P0–P2)
- [TECHNICAL_CLEANUP_PLAN](./TECHNICAL_CLEANUP_PLAN.md) — active technical debt roadmap
- [signal-dag-e2e-evidence-20260306T000429Z](./signal-dag-e2e-evidence-20260306T000429Z.md) — E2E verification artifact for Signal DAG

## Deployment

- [deploy-profiles](./deploy-profiles.md) — full-execution vs orchestrator-only profiles
- [deploy-vps](./deploy-vps.md) — VPS full-execution setup
- [deploy-railway](./deploy-railway.md) — Railway orchestrator-only setup
- [SETUP_GUIDE_OATH_MIGRATION](./SETUP_GUIDE_OATH_MIGRATION.md) — optional OAuth migration guide

## Rule

If a planning/analysis doc conflicts with an authoritative doc, authoritative docs win.
If an analysis doc conflicts with `memory/sprint-prompts-memory-system.md`, the sprint prompts win for memory system behavior.

CoPaw note: current integration is adapter-first and feature-flagged; it is not a full replatform.
UI note: the supported operator interface is now the CoPaw-style frontend in `agent-ui/`, with KEET runtime actions exposed through adapter endpoints in `control-server.ts`.
Host-shell note: CoPaw now hosts both a native `KEET` runtime section and a separate stock `CoPaw Agent` section.
Runtime note: shell-level observability now includes workspace, skill, memory, and dual-runtime split endpoints.
Authority note: KEET now reads CoPaw-managed provider and Ollama settings through the compatibility bridge in `src/copaw-system.ts`.
Host blocker note: remaining host blocker is Apple container builder DNS failure resolving `deb.debian.org` during `nanoclaw-agent:latest` build.

Note: 10 non-normative analysis/planning docs moved to `docs/SAFE TO DELETE/` — they were not part of any current active spec.

Rollback:
- [COPAW_UI_ROLLBACK_RUNBOOK](./COPAW_UI_ROLLBACK_RUNBOOK.md)
