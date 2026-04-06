---
description: Set up ccstatusline as your Claude Code status line
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

# ccstatusline Setup

You are setting up ccstatusline as the user's Claude Code status line.

## Steps

1. Read `~/.claude/settings.json` to check the current statusLine configuration.

2. Find the ccstatusline plugin directory:
```bash
plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/ccstatusline/ccstatusline/*/ 2>/dev/null | sort -t/ -k$(echo "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache/ccstatusline/ccstatusline/" | tr '/' '\n' | wc -l) -V | tail -1)
echo "Plugin dir: $plugin_dir"
```

3. If a plugin directory was found, set the statusLine command in `~/.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<plugin_dir>dist/ccstatusline.js\"",
    "padding": 0
  }
}
```

Replace `<plugin_dir>` with the actual path found in step 2.

4. If no plugin directory was found, fall back to npx:
```json
{
  "statusLine": {
    "type": "command",
    "command": "npx renaissance-dan/ccstatusline@latest",
    "padding": 0
  }
}
```

5. Confirm to the user that ccstatusline is now configured. Tell them to start a new Claude Code session to see it, or that it will take effect on the next tool call in the current session.

6. Ask if they want to run `/ccstatusline:configure` to customize their widget layout.
