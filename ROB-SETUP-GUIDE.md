# Rob's ccstatusline Setup Guide

This guide shows you how to configure ccstatusline to match my exact setup: a single-line status bar showing the model name, context length, block/session usage with cost estimates and reset timers, and weekly usage with reset day.

**What it looks like:**

```
Claude Opus 4.6 | 42.3k | Block: 18.2% (~$14/$89) resets in 3hr 45m | Weekly: 12.0% resets Friday
```

## Prerequisites

This setup uses API usage widgets that require a Claude Pro/Max subscription (they read from the Anthropic usage API using your OAuth credentials).

## Step 1: Install from this fork

```bash
# Clone the fork (has the API usage widgets)
git clone https://github.com/robjampar/ccstatusline.git
cd ccstatusline
bun install
```

## Step 2: Configure Claude Code to use it

Add this to your `~/.claude/settings.json`:

```json
{
  "statusLine": "bun run /path/to/ccstatusline/src/ccstatusline.ts"
}
```

Replace `/path/to/ccstatusline` with the actual path where you cloned the repo.

## Step 3: Apply the settings

Copy this JSON to `~/.config/ccstatusline/settings.json`:

```json
{
  "version": 3,
  "lines": [
    [
      {
        "id": "1",
        "type": "model",
        "color": "cyan",
        "rawValue": true
      },
      {
        "id": "2",
        "type": "separator"
      },
      {
        "id": "3",
        "type": "context-length",
        "color": "brightBlack"
      },
      {
        "id": "4",
        "type": "separator"
      },
      {
        "id": "su1",
        "type": "session-usage",
        "color": "yellow",
        "rawValue": true
      },
      {
        "id": "5",
        "type": "separator"
      },
      {
        "id": "wu1",
        "type": "weekly-usage",
        "color": "cyan",
        "rawValue": true
      }
    ]
  ],
  "flexMode": "full-minus-40",
  "compactThreshold": 60,
  "colorLevel": 2,
  "inheritSeparatorColors": false,
  "globalBold": false,
  "powerline": {
    "enabled": false,
    "separators": [""],
    "separatorInvertBackground": [false],
    "startCaps": [],
    "endCaps": [],
    "autoAlign": false
  }
}
```

## Widget breakdown

| Widget | Type | Color | Raw Value | What it shows |
|--------|------|-------|-----------|---------------|
| Model | `model` | cyan | yes | Model name without label, e.g. `Claude Opus 4.6` |
| Context Length | `context-length` | brightBlack (gray) | no | Current context token count, e.g. `Ctx: 42.3k` |
| Session Usage | `session-usage` | yellow | yes | Block usage %, estimated cost, and reset countdown, e.g. `Block: 18.2% (~$14/$89) resets in 3hr 45m` |
| Weekly Usage | `weekly-usage` | cyan | yes | Weekly usage % and reset day, e.g. `Weekly: 12.0% resets Friday` |

### Key settings

- **`rawValue: true`** on model removes the "Model:" label prefix
- **`rawValue: true`** on session-usage switches from a progress bar to the compact text format with cost estimates and reset timer
- **`rawValue: true`** on weekly-usage switches from a progress bar to the compact text format with reset day
- **`flexMode: full-minus-40`** reserves space so the auto-compact message doesn't wrap
- **`colorLevel: 2`** enables 256-color mode

## Customizing further

Run the TUI to interactively adjust widgets, colors, and layout:

```bash
bun run /path/to/ccstatusline/src/ccstatusline.ts
```

(Run it without piped input to get the interactive configuration UI.)
