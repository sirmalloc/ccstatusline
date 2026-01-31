#!/bin/bash
# Claude Code Task Timer Hook
# Tracks Claude Code task execution time and displays it in the status line
#
# Dual-mode design:
#   - Hook mode: Called by Claude Code to handle events and record timing
#   - Display mode: Called by ccstatusline to show current task duration
#
# Supports multiple parallel instances using session_id to distinguish them

TIMING_DIR="$HOME/.claude/.timing"

# Read JSON data from stdin (Claude Code passes event data)
INPUT=$(cat)

# Parse hook event type
HOOK_EVENT=$(echo "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

# Parse session_id to distinguish different Claude Code instances
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

# Parse stop_hook_active field (prevents infinite loop)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"[[:space:]]*:[[:space:]]*[a-z]*' | sed 's/.*:[[:space:]]*//')

# If no session_id, use fallback (compatibility with older versions or single instance)
if [ -z "$SESSION_ID" ]; then
    SESSION_ID="default"
fi

# Ensure directory exists
mkdir -p "$TIMING_DIR"

# Session-based independent files to support multiple parallel instances
TIMING_FILE="$TIMING_DIR/timing_${SESSION_ID}"
DURATION_FILE="$TIMING_DIR/duration_${SESSION_ID}"

# Duration formatting function
format_duration() {
    local ELAPSED=$1
    if [ $ELAPSED -ge 3600 ]; then
        HOURS=$((ELAPSED / 3600))
        MINUTES=$(((ELAPSED % 3600) / 60))
        SECONDS=$((ELAPSED % 60))
        echo "${HOURS}h ${MINUTES}m ${SECONDS}s"
    elif [ $ELAPSED -ge 60 ]; then
        MINUTES=$((ELAPSED / 60))
        SECONDS=$((ELAPSED % 60))
        echo "${MINUTES}m ${SECONDS}s"
    else
        echo "${ELAPSED}s"
    fi
}

# Determine call mode: if no HOOK_EVENT, this is a ccstatusline call (Display mode)
if [ -z "$HOOK_EVENT" ]; then
    # Display mode: show real-time duration
    if [ -f "$TIMING_FILE" ]; then
        # Task in progress: calculate real-time duration
        START_TIME=$(cat "$TIMING_FILE")
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        DURATION_STR=$(format_duration $ELAPSED)
        echo "Running: ${DURATION_STR}"
    elif [ -f "$DURATION_FILE" ]; then
        # Task completed: show final duration
        DURATION_STR=$(cat "$DURATION_FILE")
        echo "Completed: ${DURATION_STR}"
    else
        # No task record
        echo ""
    fi
    exit 0
fi

# Hook mode: handle various events

if [ "$HOOK_EVENT" = "UserPromptSubmit" ]; then
    # User submitted prompt: only record start time if cache file doesn't exist
    # This ensures continuous conversations don't reset the timer
    if [ ! -f "$TIMING_FILE" ]; then
        date +%s > "$TIMING_FILE"
    fi
    # Clear previous completion time display
    rm -f "$DURATION_FILE"

elif [ "$HOOK_EVENT" = "Stop" ]; then
    # Agent stopped: check if this is a second trigger (prevents infinite loop)
    if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
        exit 0
    fi

    # First trigger: calculate duration
    if [ -f "$TIMING_FILE" ]; then
        START_TIME=$(cat "$TIMING_FILE")
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        DURATION_STR=$(format_duration $DURATION)

        # Save duration for ccstatusline to display
        echo "$DURATION_STR" > "$DURATION_FILE"

        # Clean up start time file
        rm -f "$TIMING_FILE"

        # NOTE: Uncomment the following line to enable decision:block mode
        # This will make Claude output the task duration when tasks complete
        # echo "{\"decision\": \"block\", \"reason\": \"Task duration: ${DURATION_STR}\"}"
        exit 0
    fi

elif [ "$HOOK_EVENT" = "SessionEnd" ]; then
    # Session ended: clean up all cache files
    rm -f "$TIMING_FILE"
    rm -f "$DURATION_FILE"
fi

exit 0
