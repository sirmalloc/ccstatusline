---
description: Set up ccstatusline as your Claude Code status line
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

# ccstatusline Setup

You are setting up ccstatusline as the user's Claude Code status line.

## Steps

1. Read `~/.claude/settings.json` to check the current statusLine configuration. **If a `statusLine` is already configured**, check whether it works before changing anything:
```bash
echo '{}' | eval $(jq -r '.statusLine.command' ~/.claude/settings.json) 2>/dev/null && echo "WORKING" || echo "BROKEN"
```
If it's working, tell the user their statusLine is already configured and ask if they want to reconfigure it. If they decline, stop here.

2. Find the ccstatusline binary by checking candidate paths in priority order. Use the **first path where `dist/ccstatusline.js` actually exists**:
```bash
# Check local plugin first, then cached versions (newest first), then fall back to npx
for candidate in \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/local/ccstatusline/" \
  $(ls -dr "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/ccstatusline/ccstatusline/*/ 2>/dev/null); do
  if [ -f "${candidate}dist/ccstatusline.js" ]; then
    plugin_dir="$candidate"
    break
  fi
done
echo "Plugin dir: ${plugin_dir:-NOT FOUND}"
```

3. **Validate the binary before writing config.** If a plugin directory was found, verify it actually executes:
```bash
echo '{}' | node "${plugin_dir}dist/ccstatusline.js" 2>/dev/null && echo "VALID" || echo "INVALID"
```
Only proceed if validation passes. If it fails, try the next candidate or fall back to npx.

4. If a valid plugin directory was found, set the statusLine command in `~/.claude/settings.json`:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<plugin_dir>dist/ccstatusline.js\"",
    "padding": 0
  }
}
```

Replace `<plugin_dir>` with the validated path from step 3.

5. If no valid plugin directory was found, fall back to npx:
```json
{
  "statusLine": {
    "type": "command",
    "command": "npx renaissance-dan/ccstatusline@latest",
    "padding": 0
  }
}
```

6. Confirm to the user that ccstatusline is now configured. Tell them to start a new Claude Code session to see it, or that it will take effect on the next tool call in the current session.

7. Ask if they want to run `/ccstatusline:configure` to customize their widget layout.
