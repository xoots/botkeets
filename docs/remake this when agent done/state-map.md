# State Map

This document maps all persistent state in the system - files, SQLite databases, IPC communications, and in-memory state that would be lost on restart.

## SQLite Tables

| Table | What's Stored | Who Reads/Writes |
|-------|---------------|------------------|
| messages | Chat messages with metadata (id, chat_jid, sender, content, timestamp, is_from_me, is_bot_message) | Written by `storeMessage()` in db.ts, Read by `getNewMessages()` in db.ts |
| chat_metadata | Chat metadata (chat_jid, timestamp, name, channel, is_group) | Written by `storeChatMetadata()` in db.ts, Read by various functions in db.ts |
| sessions | Session information (folder, provider, session_id) | Written by `setSession()` in db.ts, Read by `getSession()` in db.ts |
| registered_groups | Registered group information | Written by `setRegisteredGroup()` in db.ts, Read by `getRegisteredGroup()` in db.ts |
| scheduled_tasks | Scheduled task information | Written by `createTask()` in db.ts, Read by various functions in db.ts |
| task_run_logs | Task execution logs | Written by `logTaskRun()` in db.ts, Read by analytics functions |
| router_state | Router state information | Written by `setRouterState()` in db.ts, Read by `getRouterState()` in db.ts |
| evolution_suggestions | Evolution suggestions | Written by `insertEvolutionSuggestion()` in db.ts, Read by suggestion functions |

## File State

| Filename Pattern | What It Contains | Writer | Reader |
|------------------|------------------|--------|--------|
| AGENT/state.json | Global agent state (last_channel, timestamp) | Written by `saveState()` in state-manager.ts, Read by `loadState()` in state-manager.ts |
| AGENT/active-tasks.json | Active task registry (task entries with status, workspace info) | Written by `persist()` in task-registry.ts, Read by `load()` in task-registry.ts |
| AGENT/ipc/*/current_tasks.json | Current tasks for IPC communication | Written by container-runner.ts, Read by container-runner.ts |
| AGENT/logs/clarification-pending.json | Pending clarification state for tasks | Written by `persist()` in clarification-store.ts, Read by `hydrate()` in clarification-store.ts |
| AGENT/main/memory/session/STATE.md | Session state information (position, focus, active projects, decisions, blockers) | Written by the system, Read by the system |
| AGENT/main/memory/session/RECENT.md | Recent message history | Written by the system, Read by the system |
| AGENT/.claude/settings.local.json | Claude settings | Written by ensureClaudeSettings() in container-runner.ts, Read by the system |
| AGENT/sessions/*/.claude/settings.json | Session-specific Claude settings | Written by ensureClaudeSettings() in container-runner.ts, Read by the system |
| AGENT/*/vault.env | Vault credentials for projects | Written by project planning system, Read by `readVault()` in project-workspace.ts |
| AGENT/*/task_state.json | Task state during execution (steps, status, workspace info) | Written by task-state.ts during task execution, Read by task-state.ts |
| AGENT/*/task.md | Task descriptions | Written by project planning system, Read by project planning system |
| AGENT/db.sqlite | SQLite database file | Written by db.ts, Read by db.ts |
| Groups log files | Container execution logs | Written by container-runner.ts, Read by administrators |
| AGENT/projects/* | Project workspaces | Written by project-workspace.ts, Read by various components |
| AGENT/logs/* | Execution logs | Written by logger.ts, Read by administrators |

## IPC Messages

| Message Type | Sender | Receiver | Trigger |
|--------------|--------|----------|---------|
| Input messages (JSON files) | Host agent | Container | Written to `/workspace/ipc/*/input/` directory when sending prompts to containers |
| Close sentinel (_close file) | Host agent | Container | Written to `/workspace/ipc/*/input/_close` to signal container to wind down |
| Output messages (delimited JSON) | Container | Host agent | Written to stdout by container processes and parsed by host agent |
| Alert sentinels (JSON files) | Host agent | Cline Bridge | Written to `/workspace/ipc/_alerts/` for cross-system communication |

## In-Memory Only

| Variable | File It Lives In | What's Lost on Restart |
|----------|------------------|------------------------|
| activeModes Map | mode-manager.ts | Active routing modes per chat JID |
| registry Record | task-registry.ts | Active and recently completed task entries |
| _pending Map | clarification-store.ts | Pending clarification state for tasks |
| state.registeredGroups | state-manager.ts | Registered groups information |
| state.lastTimestamp | state-manager.ts | Last processed message timestamp |
| state.lastAgentTimestamp | state-manager.ts | Last agent timestamp per group |
| state.sessions | state-manager.ts | Session information per folder/provider |
| state.messageLoopRunning | state-manager.ts | Message loop running state |
| activeContainers Map | index.ts | Currently active container processes |
| queue GroupQueue | index.ts | Message queue state |
| telegram Channel | index.ts | Telegram connection state |
| discord Channel | index.ts | Discord connection state |
| modelPickerState Map | state-manager.ts | Model preferences per group |

## State Gaps and Improvements

1. **Enhanced Task Progress Tracking**: Task states are now persisted more comprehensively in task_state.json files with detailed step tracking, workspace info, and narrative summaries.

2. **Improved Session Management**: Sessions are now stored per provider (folder/provider key) allowing multi-model context continuity.

3. **Better Error State Persistence**: Error states during task execution are now systematically logged in task_run_logs table for post-restart analysis.

4. **Cross-System Communication**: Alert sentinels enable communication with external systems like Cline/Qwen for seamless handoffs.

5. **Model Preference Tracking**: Per-group model preferences are persisted in registered_groups table for consistent routing.

6. **Scheduled Task Management**: Comprehensive scheduling system with run logs and status tracking.

7. **Evolution Suggestions**: System can track and manage suggestions for skill/memory improvements.

## Related Documentation

For detailed routing and fallback mechanisms, see:
- [Routing and Fallback Map](routing-fallback-map.md)
- [Model and Mode Coverage](model-mode-coverage.md)
