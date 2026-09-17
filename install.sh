#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$SCRIPT_DIR/dist/ccstatusline.js"
SETTINGS="$HOME/.claude/settings.json"

echo "==> Installing ccstatusline from $SCRIPT_DIR"

# Build
echo "==> Building..."
bun install --frozen-lockfile
bun run build

# Patch settings.json
if [ ! -f "$SETTINGS" ]; then
  echo "ERROR: $SETTINGS not found. Is Claude Code installed?"
  exit 1
fi

COMMAND="node $DIST"

# Use python3 to safely edit JSON
python3 - "$SETTINGS" "$COMMAND" <<'EOF'
import json, sys
path, cmd = sys.argv[1], sys.argv[2]
with open(path) as f:
    s = json.load(f)
s.setdefault('statusLine', {})
s['statusLine']['type'] = 'command'
s['statusLine']['command'] = cmd
s['statusLine'].setdefault('padding', 0)
with open(path, 'w') as f:
    json.dump(s, f, indent=2)
print(f"  statusLine.command => {cmd}")
EOF

echo "==> Done. Restart Claude Code to apply."
