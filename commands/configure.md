---
description: Configure ccstatusline widget layout and display options
allowed-tools: Read, Write, AskUserQuestion
---

# ccstatusline Configuration

You are helping the user configure their ccstatusline layout. Settings are stored at `~/.config/ccstatusline/settings.json`.

## Step 1: Read current settings

Read `~/.config/ccstatusline/settings.json`. If it doesn't exist, you'll create it with defaults.

## Step 2: Ask about layout preference

Ask the user:

**How many status lines do you want?**
- **1 line** — compact, everything on one row (best for narrow terminals or minimal preference)
- **2 lines** — metrics on top, activity on bottom (good balance)
- **3 lines** — metrics, usage/environment, and activity each get their own line (most readable)

## Step 3: Ask about widgets

Ask the user which widgets they want (multi-select). Group by category:

**Core:**
- Model name
- Context bar (usage progress bar)
- Session clock (time elapsed)

**Git:**
- Branch name
- Changes (+insertions, -deletions)

**Usage:**
- Session usage (5-hour limit with reset countdown)
- Weekly usage (7-day limit with reset countdown)

**Context:**
- Environment (CLAUDE.md, MCP, rules, hooks counts)

**Activity (dynamic — hides when idle):**
- All Activity (tools + agents + todos combined)
- Tools Activity (running/completed tools only)
- Agents Activity (subagent status only)
- Todo Progress (task completion only)

## Step 4: Build the settings

Based on their choices, construct the settings JSON. Follow these rules:

- Add `{"type": "separator"}` between widgets on the same line
- Use these default colors: model=cyan, context-bar=green, session-clock=yellow, git-branch=magenta, git-changes=yellow, session-usage=brightCyan, weekly-usage=blue, environment=brightBlack, activity=cyan, todo-progress=yellow
- Set `rawValue: true` on model, session-clock, git-branch, and environment widgets (removes label prefix for compact display)
- Set `metadata: {"display": "progress-short"}` on session-usage and weekly-usage
- Use `flexMode: "full-minus-40"`
- Use `autoWrap: true`

## Step 5: Write and confirm

Write the settings to `~/.config/ccstatusline/settings.json` and tell the user it will take effect on the next tool call or message.

## Available widget types

For reference, these are all valid widget type strings:

model, output-style, git-branch, git-changes, git-insertions, git-deletions, git-root-dir, git-worktree, current-working-dir, tokens-input, tokens-output, tokens-cached, tokens-total, context-length, context-percentage, context-percentage-usable, context-bar, session-clock, session-cost, session-name, claude-session-id, version, terminal-width, free-memory, session-usage, weekly-usage, reset-timer, block-timer, tools-activity, agents-activity, todo-progress, activity, environment, custom-text, custom-command, link, separator, flex-separator
