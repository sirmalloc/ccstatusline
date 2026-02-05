# Skills Tracking Hook

Logs skill invocations for the ccstatusline Skills widget.

## What It Tracks

- **User slash commands** (`/commit`, `/review-pr`) via `UserPromptSubmit` hook
- **Claude's Skill tool** invocations via `PreToolUse` hook

## Installation

```bash
# Copy and make executable
mkdir -p ~/.claude/hooks
cp scripts/hooks/track-skill.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/track-skill.sh
```

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/track-skill.sh" }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/track-skill.sh" }]
      }
    ]
  }
}
```

Restart Claude Code.

## Output

Writes JSONL to `~/.claude/ccstatusline/skills-{session}.jsonl`:

```json
{"timestamp":"2025-01-15T10:30:00Z","session_id":"abc123","skill":"commit","source":"UserPromptSubmit"}
{"timestamp":"2025-01-15T10:35:00Z","session_id":"abc123","skill":"review-pr","source":"PreToolUse"}
```

## Requirements

- `jq` (`brew install jq` on macOS)
- Bash 4.0+
