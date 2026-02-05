#!/bin/bash
# Tracks skill invocations for ccstatusline Skills widget
# Handles: PreToolUse (Claude's Skill tool) and UserPromptSubmit (user slash commands)
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
[ -z "$SESSION_ID" ] && { echo '{}'; exit 0; }

HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
SKILL_NAME=""

if [ "$HOOK_EVENT" = "PreToolUse" ]; then
    [ "$(echo "$INPUT" | jq -r '.tool_name')" = "Skill" ] && \
        SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')
elif [ "$HOOK_EVENT" = "UserPromptSubmit" ]; then
    PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
    [[ "$PROMPT" =~ ^/([a-zA-Z0-9_:-]+) ]] && SKILL_NAME="${BASH_REMATCH[1]}"
fi

[ -z "$SKILL_NAME" ] && { echo '{}'; exit 0; }

OUTPUT_DIR="$HOME/.claude/ccstatusline"
mkdir -p "$OUTPUT_DIR"

jq -c -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg sid "$SESSION_ID" \
    --arg skill "$SKILL_NAME" --arg src "$HOOK_EVENT" \
    '{timestamp:$ts,session_id:$sid,skill:$skill,source:$src}' >> "$OUTPUT_DIR/skills-$SESSION_ID.jsonl"

echo '{}'
