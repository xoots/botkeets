# V3 Parity Backlog (Decision-Complete)

Date: 2026-03-03

## Prioritization Rules
1. Production risk first (security/reliability)
2. User-visible correctness second
3. Feature completeness third

## Backlog
| Priority | Item | Classification | Acceptance Test | Owner |
| --- | --- | --- | --- | --- |
| P0 | Control-server HTTP integration tests | Implement | Start server, verify 401/503/200 on mutating routes with/without token | Platform |
| P0 | End-to-end startup matrix tests | Implement | Boot with env combinations and assert fail-fast or success with explicit reason | Platform |
| P1 | Secret redaction contract for app logs | Implement | Seed fake secrets, run task, assert no raw secret appears in logs/state files | Platform |
| P1 | Clarification resume integration test | Implement | Persist pending clarification, restart process, resume with answers, complete task | Platform |
| P1 | UI auth UX hardening | Implement | Mutating actions show explicit auth error feedback when token missing | UI |
| P2 | Memory system docs/code parity | De-scope or rewrite docs | All unimplemented features marked roadmap in truth docs | Docs |
| P2 | Self-improvement auto-policy loop | Roadmap | Weekly job emits proposed policy diff artifact | Platform |

## Locked Sprint Shape for V3
1. Sprint A: integration test harness + control/startup coverage
2. Sprint B: secret redaction + resume reliability hardening
3. Sprint C: docs parity closure for memory/self-improvement claims
4. Sprint D: optional roadmap features (only after parity gates pass)
