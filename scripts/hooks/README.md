# ccstatusline Hooks

Hook scripts for extending Claude Code integration with ccstatusline.

## Skills Tracking Hook

The `track-skill.sh` script logs skill invocations to enable the Skills widget.

### How It Works

1. Claude Code triggers the hook on `PreToolUse` for the `Skill` tool
2. The hook extracts the skill name and session ID from the input
3. Writes an entry to `~/.claude/ccstatusline/skills-{session}.jsonl`
4. The Skills widget reads this file to display skill invocations

### Installation

#### 1. Copy the hook script

```bash
# Create hooks directory (if needed)
mkdir -p ~/.claude/hooks

# Copy the script
cp scripts/hooks/track-skill.sh ~/.claude/hooks/

# Make executable
chmod +x ~/.claude/hooks/track-skill.sh
```

#### 2. Configure Claude Code

Add the hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/track-skill.sh"
          }
        ]
      }
    ]
  }
}
```

#### 3. Restart Claude Code

The hook will now log skill invocations.

### Output Format

The hook writes JSONL (one JSON object per line) to `~/.claude/ccstatusline/skills-{session}.jsonl`:

```json
{"timestamp":"2025-01-15T10:30:00Z","session_id":"abc123","skill":"commit","args":"-m 'feat: add feature'"}
{"timestamp":"2025-01-15T10:35:00Z","session_id":"abc123","skill":"review-pr","args":"123"}
```

### Troubleshooting

**Hook not triggering:**
- Verify `~/.claude/settings.json` has correct syntax (valid JSON)
- Check the `matcher` is exactly `"Skill"` (case-sensitive)
- Restart Claude Code after changing settings

**No output file created:**
- Check script has execute permissions: `ls -la ~/.claude/hooks/track-skill.sh`
- Verify `jq` is installed: `which jq`
- Run manually to test: `echo '{"session_id":"test","tool_input":{"skill":"commit"}}' | ~/.claude/hooks/track-skill.sh`

**Permission errors:**
- Ensure `~/.claude/ccstatusline/` directory is writable
- Check disk space

### Requirements

- `jq` - JSON processor (install via `brew install jq` on macOS)
- Bash 4.0+
