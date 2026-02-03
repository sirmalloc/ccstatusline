#!/bin/bash
# ccstatusline skill tracker hook
# Logs Claude Code skill invocations to a JSONL file for the Skills widget
#
# Installation: Add to ~/.claude/settings.json under "hooks"
# See README.md for full instructions

set -euo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Extract session ID from the hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [ -z "$SESSION_ID" ]; then
    # No session ID available, skip logging
    exit 0
fi

# Extract skill name from tool_input
SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

if [ -z "$SKILL_NAME" ]; then
    # No skill name in input, skip
    exit 0
fi

# Extract optional args
SKILL_ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // ""')

# Create output directory
OUTPUT_DIR="$HOME/.claude/ccstatusline"
mkdir -p "$OUTPUT_DIR"

# Output file path (one per session)
OUTPUT_FILE="$OUTPUT_DIR/skills-${SESSION_ID}.jsonl"

# Build log entry
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOG_ENTRY=$(jq -n \
    --arg ts "$TIMESTAMP" \
    --arg session "$SESSION_ID" \
    --arg skill "$SKILL_NAME" \
    --arg args "$SKILL_ARGS" \
    '{timestamp: $ts, session_id: $session, skill: $skill, args: $args}')

# Append to JSONL file
echo "$LOG_ENTRY" >> "$OUTPUT_FILE"

# Output empty JSON to allow the tool use to proceed
echo '{}'
