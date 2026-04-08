# Task Objective Widget & Terminal Title

Two new features that display what Claude is currently working on.

## Overview

The **task-objective widget** shows the current task in the status line with a status emoji and elapsed timer. The **terminal title** feature sets the terminal tab title using a configurable template. Both read from the same task file, written by Claude during the session.

```
Model: Opus 4.6 | Ctx: 42k | ⎇ main | (+12,-3) | 🔄 Implement auth flow (3m)
                                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                    task-objective widget
```

Terminal tab: `Implement auth flow | my-repo/main`

## How It Works

The task-objective system bridges a gap: Claude Code doesn't expose its `session_id` to the conversation, but the status line command receives it in its stdin JSON. The system has three moving parts:

### 1. Session ID Discovery

**Problem:** Claude needs to write a task file keyed by session ID, but doesn't know its own session ID.

**Solution:** ccstatusline acts as a bridge. On every status line render:

1. ccstatusline receives `session_id` in its stdin JSON from Claude Code
2. It walks up the process tree to find the Claude Code CLI PID (the process named `claude`)
3. It writes the session ID to `~/.cache/ccstatusline/sessions/<claude-pid>`

Claude can then discover its session ID by:

1. Running `echo $PPID` — this returns the Claude CLI PID (the Bash tool runs under Claude Code as its parent)
2. Reading `~/.cache/ccstatusline/sessions/<PPID>` — this file contains the session ID

This works because ccstatusline and Claude's Bash tool share the same ancestor process (the Claude CLI), so the PID ccstatusline discovers via the process tree walk matches Claude's `$PPID`.

```
Claude Code CLI (PID 12345)          ← Both find this PID
├── ccstatusline (walks tree up)     ← Writes sessions/12345
└── bash (echo $PPID → 12345)       ← Claude reads sessions/12345
```

**Files:** `src/utils/session-discovery.ts`

### 2. Task File

Claude writes a minimal JSON file at `~/.cache/ccstatusline/tasks/claude-task-<session-id>`:

```json
{"task": "Implement auth flow", "status": "in_progress"}
```

The `task` field is the only required field — a short description of the current objective. The `status` field is optional and controls the emoji indicator (defaults to `in_progress`). Plain text (first line) is also accepted as a fallback format.

**Status indicators:**

| Status | Indicator | Meaning |
|--------|-----------|---------|
| `in_progress` | 🔄 | Actively working (default) |
| `complete` | ✅ | Task finished successfully |
| `failed` | ❌ | Task failed |
| `blocked` | 🛑 | Waiting on user input or external dependency |
| `paused` | ⏸️ | Work paused, will resume |
| `reviewing` | 🔍 | Reviewing code or waiting for review |

**Elapsed timer:** The widget tracks how long the current task has been active. The timer uses the task file's modification time (`mtime`) as the start time, so it persists across ccstatusline process restarts. The timer resets automatically when the task text changes (new task). Claude does not need to manage timing — ccstatusline handles it entirely.

**Files:** `src/widgets/TaskObjective.ts`

### 3. Terminal Title

A configurable template that resolves placeholders from the current context:

| Placeholder | Source |
|-------------|--------|
| `{task}` | Task file (same as widget) |
| `{repo}` | Git repository name |
| `{branch}` | Current git branch |
| `{model}` | Claude model display name |
| `{dir}` | Working directory basename |

Template segments separated by ` | ` are dropped when all their placeholders are empty. For example, `{task} | {repo}/{branch}` gracefully falls back to `{repo}/{branch}` when no task is set.

The title is emitted as an OSC 1 escape sequence via stderr after each status line render.

**Files:** `src/utils/terminal-title.ts`

## Install Flow

When the task-objective widget is present in the ccstatusline config, `installStatusLine()` configures three things in Claude Code:

### Permissions (`~/.claude/settings.json`)

```json
{
  "permissions": {
    "allow": [
      "Bash(echo $PPID)",
      "Read(//Users/alice/.cache/ccstatusline/sessions/*)"
    ]
  }
}
```

- `Bash(echo $PPID)` — allows Claude to discover its parent PID without prompting
- `Read(//...)` — allows Claude to read the session discovery file (uses `//` absolute path prefix per Claude Code conventions)

### PreToolUse Hook (`~/.claude/settings.json`)

```json
{
  "hooks": {
    "PreToolUse": [{
      "_tag": "ccstatusline-task-objective",
      "matcher": "Write",
      "hooks": [{
        "type": "command",
        "command": "jq -r 'if .tool_name == \"Write\" and (.tool_input.file_path | test(\"claude-task-\")) then {\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\"}} else {} end'"
      }]
    }]
  }
}
```

This hook auto-approves Write tool calls to task files without prompting the user. It only matches files containing `claude-task-` in the path; all other Write calls pass through normally.

**Why a hook instead of permissions?** Claude Code's Write permission system doesn't reliably match paths outside the project directory, regardless of format (`//absolute`, `~`, relative, `**` globs). This appears to be a [Claude Code limitation](https://github.com/anthropics/claude-code/issues/38391). The `PreToolUse` hook with `permissionDecision: "allow"` bypasses this.

### CLAUDE.md Instructions (`~/.claude/CLAUDE.md`)

The installer appends instructions (wrapped in `<!-- ccstatusline:task-objective -->` markers) that tell Claude how to:

1. Discover its session ID via `echo $PPID` + reading the session file
2. Write the task file using the Write tool
3. Update the task when objectives change

The instructions include the full list of available status values. They are idempotent — re-running the installer replaces the section in place. The installer pre-creates the `~/.cache/ccstatusline/tasks/` directory.

**Files:** `src/utils/claude-md.ts`, `src/utils/claude-settings.ts`

## Uninstall

`uninstallStatusLine()` removes:
- The `ccstatusline-task-objective` tagged hooks from settings.json
- The CLAUDE.md instruction section (matched by marker comments)
- Other ccstatusline-managed hooks

## Configuration

### ccstatusline settings (`~/.config/ccstatusline/settings.json`)

Task-objective widget:
```json
{
  "id": "9",
  "type": "task-objective",
  "color": "green",
  "rawValue": true,
  "maxWidth": 50
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rawValue` | boolean | false | If true, shows just the task text; if false, prefixes with "Task: " |
| `maxWidth` | number | - | Truncate with `...` if longer |
| `color` | string | green | Widget foreground color |
| `metadata.showElapsed` | string | `"true"` | Set to `"false"` to hide the elapsed timer |

Terminal title:
```json
{
  "terminalTitle": {
    "enabled": true,
    "template": "{task} | {repo}/{branch}"
  }
}
```

## Concurrent Sessions

The system supports multiple concurrent Claude Code sessions, even in the same project directory:

- Each session has a unique `session_id` (assigned by Claude Code, survives session resume)
- Each Claude CLI process has a unique PID → unique session discovery file
- Each session writes to a unique task file (`claude-task-<session-id>`)
- The status line command runs per-session, so each session's widget reads its own task file

## Known Limitations

- **Session ID discovery is Unix-only** — uses `ps -o ppid=,comm=` to walk the process tree. Windows would need `wmic` or `tasklist`.
- **Claude Code doesn't expose session_id** — the process tree workaround is necessary until [this is resolved](https://github.com/anthropics/claude-code/issues/38390).
- **Write permissions don't work outside the project** — the PreToolUse hook workaround is necessary until [this is resolved](https://github.com/anthropics/claude-code/issues/38391).
- **Elapsed timer resets on ccstatusline process restart** — since ccstatusline launches as a fresh process per render, the timer falls back to the file's mtime. This is accurate for the initial task write but doesn't track status changes (e.g., if Claude changes status from `in_progress` to `blocked` and back, the timer reflects the last file modification, not the original task start).
- **Terminal title** uses OSC 1 escape sequences — supported by most modern terminals (iTerm2, Terminal.app, Windows Terminal) but not all.
