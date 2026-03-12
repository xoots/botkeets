#!/usr/bin/env bash
# Ralph Loop — autonomous story-by-story PRD executor
# Usage: ./ralph.sh [path/to/prd.json]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RALPH_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="${1:-$RALPH_ROOT/prd.json}"
CLAUDE_MD="$RALPH_ROOT/CLAUDE.md"
LOG_FILE="$RALPH_ROOT/ralph.log"

log() { echo "[ralph $(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Require jq
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with: brew install jq  OR  apt install jq" >&2
  exit 1
fi

# Require claude (Claude Code CLI)
if ! command -v claude &>/dev/null; then
  echo "ERROR: claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code" >&2
  exit 1
fi

get_next_story() {
  local done_ids
  done_ids=$(jq -r '.done[]' "$PRD_FILE" 2>/dev/null || echo "")
  jq -c '.stories[]' "$PRD_FILE" | while IFS= read -r story; do
    local id
    id=$(echo "$story" | jq -r '.id')
    if ! echo "$done_ids" | grep -qx "$id"; then
      echo "$story"
      return
    fi
  done
}

mark_done() {
  local story_id="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg id "$story_id" '.done += [$id]' "$PRD_FILE" > "$tmp" && mv "$tmp" "$PRD_FILE"
}

total_stories=$(jq '.stories | length' "$PRD_FILE")
log "Ralph starting. PRD: $PRD_FILE | Stories: $total_stories"

while true; do
  story=$(get_next_story)

  if [[ -z "$story" ]]; then
    log "All stories complete."
    echo ""
    echo "FACTORY COMPLETE"
    exit 0
  fi

  story_id=$(echo "$story" | jq -r '.id')
  story_title=$(echo "$story" | jq -r '.title')
  story_desc=$(echo "$story" | jq -r '.description')
  story_acceptance=$(echo "$story" | jq -r '.acceptance')
  done_count=$(jq '.done | length' "$PRD_FILE")

  log "--- Story $story_id/$total_stories: $story_title ---"
  log "Progress: $done_count/$total_stories stories done"

  # Build the prompt for this story
  STORY_PROMPT="$(cat <<PROMPT
Read CLAUDE.md for your rules, then work on this story:

**Story $story_id: $story_title**

Description: $story_desc

Acceptance criteria: $story_acceptance

Steps:
1. Read the relevant repo in ralph/ to understand current state
2. Plan the changes needed (Claude only — no execution yet)
3. Spawn Maestro subagents via the qwencode CLI for execution tasks (use Alibaba Coder Lite)
4. Run tests when done
5. If tests pass, commit with message: [ralph] story-$story_id: $story_title
6. If tests fail, fix and retry (max 3 attempts)
7. Report: STORY DONE or STORY BLOCKED: <reason>

CRITICAL: Only commit if tests pass. Do not scope-creep into other stories.
PROMPT
)"

  log "Invoking Claude Code for story $story_id..."
  if claude --print "$STORY_PROMPT" \
    --system-prompt "$(cat "$CLAUDE_MD")" \
    2>>"$LOG_FILE"; then
    log "Claude finished story $story_id"
    mark_done "$story_id"
    log "Story $story_id marked done. Continuing..."
  else
    log "ERROR: Claude exited non-zero on story $story_id. Check $LOG_FILE"
    log "Stopping loop. Fix the issue and rerun."
    exit 1
  fi

done
