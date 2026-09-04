# Usage

Usage documentation for `ccstatusline`.

If you want the main project overview, return to [README.md](../README.md).

Once configured, `ccstatusline` automatically formats your Claude Code status line. The status line appears at the bottom of your terminal during Claude Code sessions.

## Runtime Modes

- **Interactive mode (TUI)**: Launches when there is no stdin input
- **Piped mode (renderer)**: Parses Claude Code status JSON from stdin and prints one or more formatted lines
- **Version mode**: Prints the installed ccstatusline package version and exits when passed `--version`

```bash
# Interactive TUI
bun run start

# Piped mode with example payload
bun run example

# Print the installed package version
ccstatusline --version
```

## Available Widgets

### Claude & Session

- **Model** / **Output Style** / **Version** - Show the active Claude model, output style, and Claude Code CLI version. Model names omit trailing context suffixes like `(1M context)`; use **Context Window** when you want the total window size shown.
- **Claude Session ID** / **Session Name** / **Claude Account Email** - Show session identifiers plus the currently signed-in Claude account email.
- **Claude Status** - Show the current Claude/Anthropic service status from `status.claude.com` (`ok` when the indicator is `none`, otherwise the indicator word such as `minor`, `major`, `critical`, or `maintenance`). Press `h` in the editor to add a 48-hour incident-history strip of eight six-hour blocks (oldest to newest), each colored by the worst incident overlapping that block: green (none), yellow (minor), orange (major), red (critical). Responses are cached for about five minutes; on network failure the widget shows stale data when available or degrades to `?`. With the history strip enabled the widget colors itself by severity, so per-widget foreground colors and theme foregrounds are skipped, like Custom Command's preserve-colors mode.
- **Voice Status** - Show whether Claude Code voice input is enabled. It can render as an icon, icon plus text, plain text, or `voice on/off`, with optional Nerd Font microphone icons.
- **Sandbox Status** - Show the effective `sandbox.enabled` value from Claude Code's layered project and user settings. It can render as a glyph, `SB: ON/OFF`, or `Sandbox: ON/OFF`, with optional Nerd Font lock icons. The value is refreshed after `/sandbox` changes, but is best effort when managed or CLI settings override files or sandbox initialization fails.
- **Thinking Effort** / **Vim Mode** / **Skills** - Show Claude thinking effort, the current vim editing mode, and skill activity from hook data. Thinking Effort reads live status JSON first, then `/model` or `/effort` transcript output, then settings fallback; it supports `low`, `medium`, `high`, `xhigh`, and `max`, shows `default` when no effort is set, and marks unknown future values with `?`. Claude Code reports Ultracode as `xhigh` in status line data; it does not expose Ultracode as a separate effort level.
- **Session Clock** / **Session Cost** - Show elapsed session time and the current session cost in USD.

### Git

- **Git Branch** / **Git Root Dir** / **Git PR** - Show the current branch, repository root directory, and PR/MR details for the current branch with optional links. Git Branch and Git Root Dir can cap their visible labels to a per-widget maximum width; truncation keeps OSC 8 hyperlink targets intact. Works with GitHub (`gh`) and GitLab (`glab`); SSH remote aliases are resolved with `ssh -G` before provider detection, while canonical GitHub/GitLab remotes keep their original forge hosts. For self-hosted hosts whose name contains neither token, whichever CLI is authenticated against that host (`gh auth status --hostname <h>` / `glab auth status --hostname <h>`) is used.
- **Git CI Status** - Summarize GitHub checks for the current branch's pull request as failing (`✗`), pending (`●`), and successful (`✓`) counts. Raw-value mode renders `failing`, `pending`, or `passing`; `-` means no pull request or readable check rollup. This widget is GitHub-only and uses the same cached `gh` lookup as Git PR.
- **Git Changes** / **Git Insertions** / **Git Deletions** - Show aggregate file-change counts and dedicated insertion/deletion counts.
- **Git Status** / **Git Staged** / **Git Unstaged** / **Git Untracked** / **Git Ahead/Behind** / **Git Conflicts** / **Git SHA** - Show compact repo-state indicators, upstream divergence, merge-conflict count, and the current short commit SHA.
- **Git Staged Files** / **Git Unstaged Files** / **Git Untracked Files** / **Git Clean Status** - Show file-level status counts and clean/dirty state.
- **Git Origin Owner** / **Git Origin Repo** / **Git Origin Owner/Repo** - Show parsed `origin` remote metadata.
- **Git Upstream Owner** / **Git Upstream Repo** / **Git Upstream Owner/Repo** / **Git Is Fork** - Show upstream remote metadata and whether the current repo is a fork.
- **Git Worktree** / **Git Worktree Mode** / **Git Worktree Name** / **Git Worktree Branch** / **Git Worktree Original Branch** - Show worktree status plus the active worktree's name and branch metadata.

### Tokens, Usage & Context

- **Tokens Input** / **Tokens Output** / **Tokens Cached** / **Tokens Total** - Show current-session token counts. Input/output prefer cumulative transcript metrics and fall back to `context_window.total_input_tokens` / `context_window.total_output_tokens` when transcript metrics are unavailable; cached/total use transcript metrics.
- **Cache Hit Rate** / **Cache Read** / **Cache Write** - Show prompt-cache efficiency. Cache Hit Rate uses cache reads divided by cache reads plus cache writes; Cache Read and Cache Write include each value's share of prompt context. They default to the latest turn from `context_window.current_usage`, can switch to cumulative session totals, and can hide when empty.
- **Cache Timer** - Estimate time remaining before the current prompt-cache entry expires. It shows `HOT` while a main-chain turn is active, then counts down from the latest assistant request with cache activity and becomes `COLD` just before expiry. The default TTL is 5 minutes; it can switch to 1 hour, hide when no cache anchor is available, and customize the glyph for each state. Because Claude Code transcripts expose cache token activity rather than the actual expiry timestamp, the countdown is best effort.
- **Input Speed** / **Output Speed** / **Total Speed** - Show session-average token throughput with an optional per-widget rolling window (`0-120` seconds; `0` = full-session average).
- **Context Length** / **Context Window** / **Context %** / **Context % (usable)** / **Context Bar** - Show current context length, total context window size, used/remaining percentage, usable-window percentage, or a progress bar. The window size is taken from Claude Code's reported `context_window.context_window_size` when present, then from a model-name hint (e.g. a `[1m]` suffix), and finally from a fixed fallback. Set `CCSTATUSLINE_CONTEXT_SIZE_FALLBACK` to a positive integer to override that last-resort fallback (defaults to `200000`) — useful when an older Claude Code does not report the window size for a 1M-context model, so the bar would otherwise read against 200k. Immediately after `/compact`, transcript fallback uses the latest `compact_boundary.postTokens` value until a new main-chain turn reports the current size, so the widgets do not retain the pre-compaction context.
- **Compaction Counter** - Show how many context compactions have been detected in the current session by scanning transcript compaction markers. It can render as icon plus number, text plus number, or number-only, and can hide while the count is zero. Two optional, independent per-item add-ons toggle extra detail: a trigger split (`↻ 3 (2 auto, 1 manual)`; a compaction whose trigger is missing or unrecognized is bucketed as `unknown`) and tokens reclaimed (`↻ 3 ↓887.0k`, each compaction's `preTokens - postTokens` floored at 0 and summed, shown only when greater than 0 — so very old transcripts predating the `postTokens` field display nothing). Its value selector can instead render the total count, one trigger count (`auto`, `manual`, or `unknown`), or reclaimed tokens as a standalone value; hide-when-zero applies to the selected value.
- **Session Usage** / **Weekly Usage** / **Weekly Sonnet Usage** / **Weekly Opus Usage** / **Weekly Fable Usage** / **Extra Usage Utilization** / **Extra Usage Remaining** / **Extra Usage Used** / **Block Timer** / **Block Reset Timer** / **Weekly Reset Timer** - Show usage percentages, monthly pay-as-you-go overage usage, and current block/reset timing. Session and all-model weekly usage read the legacy flat API buckets when available and fall back per field to `session` and `weekly_all` entries in the newer `limits[]` response. The per-model widgets prefer `weekly_scoped` entries for Sonnet, Opus, and Fable, with legacy Sonnet/Opus buckets as fallbacks; Weekly Fable Usage renders nothing when the account has no Fable window. Session Usage, the weekly percentage widgets, and Extra Usage Utilization can show either used or remaining percentage in every display mode. Session and weekly usage bars can also show a time cursor. Extra usage widgets accept known extra-usage state as complete when an account has no monthly limit configured, avoid repeated refetches and stale `[Timeout]` output, and format amounts with the API-reported billing currency when available. Reset timers can show remaining time, progress, or exact reset date/time with timezone and locale controls; while reset data is still arriving at startup, they show a labeled loading placeholder instead of a transient API error.

### Environment, Layout & Custom

- **Current Working Dir** / **Terminal Width** / **Memory Usage** - Show the current working directory, detected terminal width, and system memory usage. Current Working Dir can prepend an optional custom glyph, including when raw-value mode replaces the `cwd:` label.
- **Custom Text** / **Custom Symbol** / **Custom Command** / **Link** - Add user-defined text, a single symbol or emoji, custom command output, or a clickable OSC 8 hyperlink.
- **Separator** / **Flex Separator** - Add a manual divider or a width-filling flexible spacer. Manual separators are disabled in Powerline mode, but flex separators still work there as layout spacers.

## Terminal Width Options

These settings affect where long lines are truncated, and where right-alignment occurs when using flex separators:
- **Full width always** - Uses full terminal width (may wrap if auto-compact message appears or IDE integration adds text)
- **Full width minus 40** - Reserves 40 characters for auto-compact message to prevent wrapping (default)
- **Full width until compact** - Dynamically switches between full width and minus 40 based on context percentage threshold (configurable, default 60%)

Flex separators expand against the detected width in both regular and Powerline rendering. If width detection is unavailable, they render like normal separators until a terminal width is available.

If ccstatusline cannot detect your terminal width, set `CCSTATUSLINE_WIDTH` to a positive integer to override probing:

```bash
CCSTATUSLINE_WIDTH=160 ccstatusline
```

The override is checked before automatic width detection, so it also works in wrapper processes, IDE integrations, nested PTYs, and Windows environments where probing may be unavailable. Invalid values such as `0`, negative numbers, or non-numeric strings are ignored and ccstatusline falls back to normal detection.

## Powerline Auto-Alignment

Powerline Setup can align widgets into shared columns across multiple status lines; press `a` there to toggle **Align Widgets**. When auto-alignment makes a naturally wide value stretch later columns, select that widget in the line editor and press `x` (**exclude align**). The selected widget and everything after it on that line keep their natural widths, while earlier columns remain aligned. This control is available only when Powerline auto-alignment is enabled and the selected widget is not merged into the previous widget.

## Global Options

Configure global formatting preferences that apply to all widgets:

![Global Options](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/global.png)

### Default Padding & Separators

- **Default Padding** - Add consistent padding around each widget
- **Padding Side** - Choose whether default padding applies to **Both** sides (default), **Left only**, or **Right only**
- **Default Separator** - Automatically insert a separator between all widgets
  - Press **(p)** to edit padding
  - Press **(d)** to cycle padding side
  - Press **(s)** to edit separator
- Manual separators look past widgets that render empty, so the intended separator remains between visible neighbors without duplicating an earlier visible boundary. Inherited separator colors come from the actual preceding visible widget.

<details>
<summary><b>Global Formatting Options</b></summary>

- **Inherit Colors** - Default separators inherit foreground and background colors from the preceding widget
  - Press **(i)** to toggle
- **Global Bold** - Apply bold formatting to all text regardless of individual widget settings
  - Press **(o)** to toggle
- **Minimalist Mode** - Force widgets into raw-value rendering globally for a cleaner, label-free status line
  - Press **(m)** to toggle
- **Number Formatting** - Choose precise, compact, or whole-number output independently for token, speed, percent, memory, and cost values
  - Press **(n)** to configure each number type; a global choice overrides per-widget formatting for that type
- **Override Foreground Color** - Force all widgets to use the same text color, or a whole-line **gradient** (see below)
  - Press **(f)** to cycle through colors
  - Press **(g)** to choose a gradient
  - Press **(x)** to clear override
- **Override Background Color** - Force all widgets to use the same background color
  - Press **(b)** to cycle through colors
  - Press **(c)** to clear override

</details>

> 💡 **Note:** These settings are applied during rendering and don't add widgets to your widget list. They provide a consistent look across your entire status line without modifying individual widget configurations.

> ⚠️ **VSCode Users:** If colors appear incorrect in the VSCode integrated terminal, the "Terminal › Integrated: Minimum Contrast Ratio" (`terminal.integrated.minimumContrastRatio`) setting is forcing a minimum contrast between foreground and background colors. You can adjust this setting to 1 to disable the contrast enforcement, or use a standalone terminal for accurate colors.

## Widget Styling

The color editor can adjust foreground color, background color, bold, dim, and gradients per widget:

- Use `←` / `→` to cycle the selected foreground or background color.
- Press `f` to switch between foreground and background editing.
- Press `b` to toggle bold.
- Press `d` to cycle dim styling: off → whole widget → parenthesized text only → off.
- Press `r` to reset styling on the selected widget, or `c` to clear styling on every widget in the line.

## Gradient Colors

A foreground color can be a multi-stop **gradient** instead of a solid. Colors interpolate in OKLab for perceptually even blends. A gradient value takes one of three forms, all prefixed `gradient:`:

- **Named preset** — `gradient:atlas` (case-insensitive). Built-in presets: `atlas`, `cristal`, `teen`, `mind`, `morning`, `vice`, `passion`, `fruit`, `instagram`, `retro`, `summer`, `rainbow`, `pastel`.
- **Dash stops** — `gradient:RRGGBB-RRGGBB[-RRGGBB...]` (two or more bare or `#`-prefixed hex stops).
- **Comma stops** — `gradient:hex:RRGGBB,#RRGGBB,RRGGBB` (two or more `hex:`/`#`/bare stops).

Gradients apply at **two scopes**:

- **Per-widget** — set a widget's color to a gradient so its text carries its own self-contained sweep. In the color menu (foreground, 256-color or truecolor mode), press **(g)** to open the gradient picker, then choose a preset or enter custom start/end hex stops.
- **Whole line** — set `overrideForegroundColor` to a gradient spec to paint the entire status line with one continuous sweep, each character colored by its column position. In the Global Overrides menu, press **(g)** on Override FG Color to open the same gradient picker, or author the value directly in `settings.json`.

Gradients self-degrade where they can't render: at Basic or No Color levels, gradient settings are preserved but render as plain text. In Powerline mode, global foreground gradients color widget text while separators and caps keep Powerline's normal foreground/background contrast rules; per-widget gradients collapse to their first stop when using 256-color or truecolor output.

## Claude Code Status Line Settings

When ccstatusline is installed in Claude Code, the main menu includes **Configure Status Line**. Claude Code versions >=2.1.97 support `statusLine.refreshInterval`; ccstatusline can set it to `1-60` seconds, defaults fresh supported installs to `10` seconds, and removes the setting when the input is left empty.

## Configuration Import and Export

The TUI main menu can move configurations between machines or preserve a backup:

- **Export Config** writes the current in-memory configuration to a JSON file, including edits that have not been saved to `settings.json` yet. The default destination is `~/ccstatusline-config.json`; parent directories are created as needed, and the export records the ccstatusline version that created it.
- **Import Config** reads a JSON file, validates it, migrates supported older formats, rejects files from newer schema versions, and shows the effective changes before anything is applied.

The import preview follows the highlighted action:

- **Replace All** replaces user-facing settings with the validated import and current defaults for omitted fields.
- **Merge** overlays only fields explicitly present in the imported file, preserving current values for omitted settings.

Both modes keep machine-local installation metadata and ignore schema/update metadata from the imported file. Applying an import updates only the TUI's working configuration; review the result, then choose **Save & Exit** or press `Ctrl+S` to persist it.

## Settings Recovery

If `settings.json` is unreadable or invalid, ccstatusline leaves the file unchanged, renders with built-in defaults for that run, and prepends an invalid-config warning badge to the status line. The TUI shows the same warning and asks for confirmation before either **Save & Exit** or `Ctrl+S` replaces the invalid file. Fix the JSON to preserve its contents, or confirm the save to replace it with the configuration currently shown in the TUI.

## Block Timer Widget

The Block Timer widget helps you track your progress through Claude Code's 5-hour conversation blocks:

![Block Timer](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/blockTimer.png)

**Display Modes:**
- **Time Display** - Shows elapsed time as "3hr 45m" (default)
- **Progress Bar** - Full width 32-character progress bar with percentage
- **Progress Bar (Short)** - Compact 16-character progress bar with percentage

**Features:**
- Automatically detects block boundaries from transcript timestamps
- Floors block start time to the hour for consistent tracking
- Shows "Block: 3hr 45m" in normal mode or just "3hr 45m" in raw value mode
- Progress bars show completion percentage (e.g., "[████████████████████████░░░░░░░░] 73.9%")
- Use **(p)** to cycle time/full bar/short bar, **(s)** for compact time mode, and **(v)** to invert fill in progress mode

## Raw Value Mode

Some widgets support "raw value" mode which displays just the value without a label:
- Normal: `Model: Claude 3.5 Sonnet` → Raw: `Claude 3.5 Sonnet`
- Normal: `Session: 2hr 15m` → Raw: `2hr 15m`
- Normal: `Block: 3hr 45m` → Raw: `3hr 45m`
- Normal: `Ctx: 18.6k` → Raw: `18.6k`

## Number Formatting

Numeric widgets support three display styles without changing their underlying values:
- **Precise** (default) keeps the formatter's normal trailing zeros, such as `1.0M` or `$1.20`
- **Compact** removes insignificant trailing zeros while preserving real fractions, such as `1M` or `1.1M`
- **Whole** rounds the displayed value to zero decimal places, such as `1M`

Select a numeric widget in the line editor and press `.` to cycle its style. In **Global Overrides**, press `n` to set a style for all token, speed, percent, memory, or cost widgets; that per-type global setting takes precedence over individual widget styles. Advanced configurations can also set `numberFormat.decimals` from `0` to `6` on a widget or number type in `settings.json`; the style then controls whether those decimal places are retained, trimmed, or suppressed.

## Widget Editor Keybinds

Common controls in the line editor:
- `↑/↓` select widget
- `←/→` open the type picker for the selected widget
- navigation wraps at list boundaries, including move/reorder mode
- `a` add widget via the picker
- `i` insert widget via the picker
- `k` clone the selected widget
- `Enter` enter/exit move mode
- `d` delete selected widget
- `c` clear the current line
- `Space` cycle a manual separator character
- `r` toggle raw value (supported widgets)
- `.` cycle precise/compact/whole number formatting (supported widgets)
- `m` cycle merge mode (`off` → `merge` → `merge no padding`)
- `x` exclude the selected widget and the rest of its line from shared Powerline column widths (shown only when Powerline auto-alignment is enabled)
- `Esc` go back

Widget picker:
- type to search categories and widgets
- supports substring, initialism, and fuzzy matching
- `↑/↓` change selection, `Enter` continue/apply, `Esc` clear search/back/cancel

The keybind footer in the TUI only shows shortcuts that apply to the currently selected widget.

Widget-specific shortcuts:
- **Glyph widgets** (Git Branch, Git Worktree, Git Worktree Mode, Git Staged, Git Unstaged, Git Untracked, Git Conflicts, Git Ahead/Behind, Git Status, JJ Bookmarks, JJ Workspace): `g` set custom glyphs for the widget's symbols; Backspace in the editor renders without one, and multi-symbol widgets (Ahead/Behind, Status, Conflicts) edit each part in one list
- **Git Branch**: `l` toggle clickable branch links (GitHub, GitLab, self-hosted), `w` set a maximum visible width (blank removes the limit)
- **Git Root Dir**: `l` cycle IDE links (`off` → `VS Code` → `Cursor`), `w` set a maximum visible width (blank removes the limit)
- **Git PR**: `s` toggle review status, `t` toggle title (renders "MR" for GitLab origins)
- **Git remote widgets** (`Git Origin*` / `Git Upstream*`): `l` toggle clickable repo links
- **Git Origin Owner/Repo**: `o` show only the owner when the repo is a fork
- **Git Conflicts**: `z` toggles how a visible conflict-free tree renders (`⚠0` or the clean glyph); `g` edits the conflict and clean glyphs
- **Context % widgets**: `u` toggle used vs remaining display, `p` cycle percentage/short bar/short bar only
- **Session Usage / Weekly Usage / Weekly Sonnet Usage / Weekly Opus Usage / Weekly Fable Usage / Extra Usage Utilization**: `p` cycle percentage/full bar/medium bar/short bar/short bar only and `u` switch between used and remaining percentage in every display mode. The editor row labels the current direction as `used` or `remaining`, while the `u` helper names the direction it will switch to. Session and weekly usage widgets use `t` to toggle the time cursor in bar modes.
- **Block Timer**: `p` cycle time/full bar/short bar, `s` toggle compact time, `v` invert fill in progress mode
- **Block Reset Timer**: `p` cycle time/full bar/short bar, `s` toggle compact time/date, `t` toggle exact reset date/time, `h` toggle 12/24-hour display in date mode, `z` edit timezone in date mode, `l` edit locale in date mode, `v` invert fill in progress mode
- **Weekly Reset Timer**: `p` cycle time/full bar/short bar, `s` toggle compact time/date, `t` toggle exact reset date/time, `h` toggle hours-only in time mode or 12/24-hour display in date mode, `z` edit timezone in date mode, `l` edit locale in date mode, `v` invert fill in progress mode
- **Context Bar**: `p` cycle medium/full/short/short-only progress bar
- **Compaction Counter**: `v` cycle value (count/auto/manual/unknown/reclaimed), `f` cycle format, `n` toggle Nerd Font icon in icon mode, `s` toggle trigger split (auto/manual/unknown), `t` toggle tokens reclaimed
- **Cache widgets** (Cache Hit Rate, Cache Read, Cache Write): `t` toggle turn/session scope
- **Cache Timer**: `t` cycle 5-minute/1-hour TTL, `g` customize the working/fresh/draining/urgent/cold glyphs
- **Sandbox Status**: `f` cycle glyph/text/word format, `n` toggle Nerd Font lock icons in glyph mode
- **Claude Status**: `h` toggle the 48-hour incident-history strip
- **Voice Status**: `f` cycle format, `n` toggle Nerd Font microphone icons
- **Current Working Dir**: `h` home abbreviation, `s` segment editor, `f` fish-style path, `g` optional leading glyph (off by default; pair with raw value to replace the `cwd:` label with the glyph)
- **Skills**: `v` cycle view mode, `l` edit list limit in list mode
- **Input Speed / Output Speed / Total Speed**: `w` edit the rolling window in seconds
- **Custom Text / Custom Symbol**: `e` edit text or symbol
- **Custom Command**: `e` command, `w` max width, `t` timeout, `p` preserve ANSI colors
- **Link**: `u` URL, `e` link text
- **Vim Mode**: `f` cycle format, `n` toggle Nerd Font icons

## Hiding Widgets Conditionally

Widgets that can hide themselves share a single `h` (`(h)ide…`) keybind in the
line editor. It opens a checklist of the hideable states the selected widget
supports; toggle entries with `Space` and confirm with `Enter`. Enabled states
appear in the editor as `(hide: no-git, zero)`.

Supported states by widget family:
- **Git widgets**: `no-git` hides the `(no git)` placeholder outside a repo
- **Git count widgets** (`Git Changes`, `Git Insertions`, `Git Deletions`, `Git Staged/Unstaged/Untracked Files`, `Git Conflicts`): `zero` hides the widget while its count is zero
- **JJ widgets**: `no-jj` hides the `(no jj)` placeholder outside a jj repo
- **Git Origin widgets**: `no-remote` hides the `no remote` placeholder
- **Git Upstream widgets / Git Ahead/Behind**: `no-upstream` hides the `no upstream` placeholder
- **Git Ahead/Behind**: `zero` hides `↑0↓0` when the branch is not diverged (enabled by default; uncheck it to show zeros)
- **Git PR** (rendered as "MR" for GitLab origins): `no-data` hides the `(no PR)` placeholder, `status` and `title` hide those segments of the PR display
- **Git CI Status**: `no-data` hides the `-` placeholder when the branch has no pull request or no readable check rollup
- **Git Is Fork**: `not-fork` hides the widget when the repo is not a fork
- **Token widgets**: `zero` hides `0` token counts at session start
- **Session Cost**: `zero` hides `$0.00`
- **Session Clock**: `zero` hides durations under one minute
- **Block Timer**: `no-data` hides the `0hr 0m` / empty-bar display when no block is active
- **Input/Output/Total Speed**: `no-data` hides the `—` placeholder when no speed data exists
- **Output Style**: `default-value` hides the widget when the style is `default`
- **Compaction Counter**: `zero` hides the counter before any compaction occurs
- **Skills**: `empty` hides the widget before any skill is used
- **Extra Usage widgets**: `disabled` hides the `n/a` display when extra usage is off, `no-data` hides the error placeholder when usage data is unavailable
- **Session / Weekly / Weekly Sonnet / Weekly Opus / Weekly Fable Usage**: `no-data` hides the error placeholder (`[No credentials]`, `[Timeout]`, `[Rate limited]`, `[API Error]`, `[Parse Error]`) when usage data is unavailable
- **Cache widgets** (`Cache Hit Rate`, `Cache Read`, `Cache Write`, `Cache Timer`): `empty` hides the widget when there is no cache activity, and on Cache Timer when no cache anchor is available
- **Custom Text / Custom Symbol**: `merge-target-hidden` hides the item when the widget it is merged with renders nothing, so icon prefixes/suffixes disappear together with their widget

In `settings.json`, the enabled states are stored as a comma-separated list in
the item's metadata, e.g. `"metadata": { "hide": "no-git,zero" }`. An empty
list (`"hide": ""`) opts out of default-enabled states such as Git
Ahead/Behind's `zero`. Configs from older versions that used per-widget
boolean keys (`hideNoGit`, `hideNoJj`, `hideNoRemote`, `hideZero`,
`hideWhenEmpty`, `hideIfDisabled`, `hideStatus`, `hideTitle`,
`hideWhenNotFork`) are converted to the unified key automatically by the
settings migration on first load. After that, downgrading to an older
ccstatusline keeps the config readable, but older versions ignore the `hide`
key, so previously hidden placeholders show again until you upgrade back.

## Custom Widgets

### Custom Text Widget

Add static text to your status line. Perfect for:
- Project identifiers
- Environment indicators (dev/prod)
- Personal labels or reminders

### Custom Symbol Widget

Add a single symbol or emoji to your status line when you want a compact visual marker:
- Nerd Font or Powerline-friendly glyphs
- Status markers like `●`, `✓`, or `⚠`
- Emoji shorthand for environments, workflows, or attention cues

### Custom Command Widget

Execute shell commands and display their output dynamically:
- Refreshes whenever the statusline is updated by Claude Code
- Receives the full Claude Code JSON data via stdin (model info, session ID, transcript path, etc.)
- Also includes `terminal_width` — the detected terminal width in columns, added by ccstatusline (omitted when it can't be determined) — so scripts can adapt their output to the available space
- Displays command output inline in your status line
- Configurable timeout (default: 1000ms)
- Optional max-width truncation
- Optional ANSI color preservation (`preserve colors`)
- Examples:
  - `pwd | xargs basename` - Show current directory name
  - `node -v` - Display Node.js version
  - `git rev-parse --short HEAD` - Show current commit hash
  - `date +%H:%M` - Display current time
  - `curl -s wttr.in?format="%t"` - Show current temperature
  - `npx -y ccusage@latest statusline` - Display Claude usage metrics (set timeout: 5000ms)
  - `cc-session-num` - Show current session rank (`#1`, `#2`, …) from [ccsessions](https://github.com/treebird7/ccsessions)

> ⚠️ **Important:** Commands should complete quickly to avoid delays. Long-running commands will be killed after the configured timeout. If you're not seeing output from your custom command, try increasing the timeout value (press 't' in the editor).

> 💡 **Tip:** Custom commands can be other Claude Code compatible status line formatters. They receive the same JSON via stdin that `ccstatusline` receives from Claude Code (augmented with a `terminal_width` field), allowing you to chain or combine multiple status line tools.

### Link Widget

Create clickable links in terminals that support OSC 8 hyperlinks:
- `metadata.url` - target URL (http/https)
- `metadata.text` - optional display text (defaults to URL)
- Falls back to plain text when URL is missing or unsupported

## Integration Example: ccusage

[ccusage](https://github.com/ryoppippi/ccusage) is a tool that tracks and displays Claude Code usage metrics. You can integrate it directly into your status line:

1. Add a Custom Command widget
2. Set command: `npx -y ccusage@latest statusline`
3. Set timeout: `5000` (5 seconds for initial download)
4. Enable "preserve colors" to keep ccusage's color formatting

![ccusage integration](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/ccusage.png)

> 📄 **How it works:** The command receives Claude Code's JSON data via stdin, allowing ccusage to access session information, model details, and transcript data for accurate usage tracking.

## Integration Example: AIWatch

[AIWatch](https://ai-watch.dev) monitors the live status of 30+ AI APIs and apps (Claude, GPT, Gemini, …). Surfacing it in your status line answers "is Claude slow because of me, or because the API is degraded?" without leaving the terminal.

1. Add a Custom Command widget
2. Set command:

   ```bash
   ( curl -sf --max-time 2 https://ai-watch.dev/api/status/cached | jq -r '[.services[] | select(.status != "operational") | "🔴 " + .name] | .[0:3] | join(" ")' ) 2>/dev/null || true
   ```

3. Set timeout: `2000` (the `curl` itself caps at 2s; the outer `|| true` keeps the widget silent on any failure)
4. Leave "preserve colors" off — the output is a plain emoji + name list

When every tracked service is operational the command prints nothing, so the widget renders empty and manual separators collapse around it. The endpoint is JSON, CORS-enabled, and served with a ~5-minute cache.

> 📄 **Variants:** See [ai-watch.dev/#statusline](https://ai-watch.dev/#statusline) for count-only, compact, provider-scoped, and clickable OSC 8 link presets.

## Integration Example: ccsessions

[ccsessions](https://github.com/treebird7/ccsessions) is a CLI session manager for Claude Code. Its companion script `cc-session-num` shows the current session's rank (`#1`, `#2`, …) matched against the same mtime-sorted list that `ccsessions` uses.

1. Install `cc-session-num`:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/treebird7/ccsessions/main/cc-session-num \
     -o ~/.local/bin/cc-session-num && chmod +x ~/.local/bin/cc-session-num
   ```

2. Add a Custom Command widget
3. Set command: `cc-session-num`
4. Leave timeout at default (the script reads `~/.claude/projects/` locally and returns in milliseconds)

The widget renders nothing when the current session isn't found, so manual separators collapse around it cleanly.

> 📄 **How it works:** `cc-session-num` reads `CLAUDE_CODE_SESSION_ID` from the environment (set by Claude Code), then ranks `~/.claude/projects/*/*.jsonl` files by modification time — the same sort order `ccsessions` uses — and prints the matching position.

## Smart Truncation

When terminal width is detected, status lines automatically truncate with ellipsis (`...`) if they exceed the available width, preventing line wrapping.
Truncation is ANSI/OSC-aware, so preserved color output and OSC 8 hyperlinks remain well-formed.
