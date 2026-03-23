<div align="center">

<pre>
              _        _             _ _            
  ___ ___ ___| |_ __ _| |_ _   _ ___| (_)_ __   ___ 
 / __/ __/ __| __/ _` | __| | | / __| | | '_ \ / _ \
| (_| (__\__ \ || (_| | |_| |_| \__ \ | | | | |  __/
 \___\___|___/\__\__,_|\__|\__,_|___/_|_|_| |_|\___|
                                                     
</pre>

# ccstatusline

**🎨 A highly customizable status line formatter for Claude Code CLI**
*Display model info, git branch, token usage, and other metrics in your terminal*

[![npm version](https://img.shields.io/npm/v/ccstatusline.svg)](https://www.npmjs.com/package/ccstatusline)
[![npm downloads](https://img.shields.io/npm/dm/ccstatusline.svg)](https://www.npmjs.com/package/ccstatusline)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/sirmalloc/ccstatusline/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/node/v/ccstatusline.svg)](https://nodejs.org)
[![install size](https://packagephobia.com/badge?p=ccstatusline)](https://packagephobia.com/result?p=ccstatusline)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/sirmalloc/ccstatusline/graphs/commit-activity)

[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge.svg)](https://github.com/hesreallyhim/awesome-claude-code)
[![ClaudeLog - A comprehensive knowledge base for Claude](https://claudelog.com/img/claude_log_badge.svg)](https://claudelog.com/)


![Demo](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/demo.gif)

</div>
<br />

## 📚 Table of Contents

- [Recent Updates](#-recent-updates)
- [Features](#-features)
- [Localizations](#-localizations)
- [Quick Start](#-quick-start)
- [Windows Support](docs/WINDOWS.md)
- [Usage](docs/USAGE.md)
  - [Widget Rules](#-widget-rules)
- [Development](docs/DEVELOPMENT.md)
- [Contributing](#-contributing)
- [License](#-license)
- [Related Projects](#-related-projects)

<br />

## 🆕 Recent Updates

<<<<<<< HEAD
### v2.2.8 - Git widgets, smarter picker search, and minimalist mode

- **🔀 New Git PR widget** - Added a `Git PR` widget with clickable PR links plus optional status and title display for the current branch.
- **🧰 Major Git widget expansion** - Added `Git Status`, `Git Staged`, `Git Unstaged`, `Git Untracked`, `Git Ahead/Behind`, `Git Conflicts`, `Git SHA`, `Git Origin Owner`, `Git Origin Repo`, `Git Origin Owner/Repo`, `Git Upstream Owner`, `Git Upstream Repo`, `Git Upstream Owner/Repo`, `Git Is Fork`, `Git Worktree Mode`, `Git Worktree Name`, `Git Worktree Branch`, `Git Worktree Original Branch`, and `Custom Symbol`.
- **👤 Claude Account Email widget** - Added a session widget that reads the signed-in Claude account email from `~/.claude.json` while respecting `CLAUDE_CONFIG_DIR`.
- **🧼 Global Minimalist Mode** - Added a global toggle in `Global Overrides` that forces widgets into raw-value mode for a cleaner, label-free status line.
- **🔎 Smarter widget picker search** - The add/change widget picker now supports substring, initialism, and fuzzy matching, with ranked results and live match highlighting.
- **📏 Better terminal width detection** - Flex separators and right-alignment now work more reliably when ccstatusline is launched through wrapper processes or nested PTYs.
- **🎨 Powerline theme continuity** - Built-in Powerline themes can now continue colors cleanly across multiple status lines instead of restarting each line.
- **📏 Conditional Widget Rules** - Define rules that dynamically change widget properties based on conditions
  - Apply color, bold, hide, and other property overrides when conditions match
  - Supports numeric operators (`>`, `>=`, `<`, `<=`, `=`, `≠`)
  - Supports string operators (`contains`, `starts with`, `ends with`, and negations)
  - Supports boolean operators (`is true`, `is false`)
  - Supports set operators (`in`, `not in` for matching against lists)
  - Cross-widget conditions: change one widget's appearance based on another widget's value
  - Rules execute top-to-bottom with optional `stop` flag to halt evaluation
  - Edit rules via the TUI: press `x` on any widget in the line editor

### v2.2.0 - v2.2.6 - Speed, widgets, links, and reliability updates

- **🚀 New Token Speed widgets** - Added three widgets: **Input Speed**, **Output Speed**, and **Total Speed**.
  - Each speed widget supports a configurable window of `0-120` seconds in the widget editor (`w` key).
  - `0` disables window mode and uses a full-session average speed.
  - `1-120` calculates recent speed over the selected rolling window.
- **🧩 New Skills widget controls (v2.2.1)** - Added configurable Skills modes (last/count/list), optional hide-when-empty behavior, and list-size limiting with most-recent-first ordering.
- **🌐 Usage API proxy support (v2.2.2)** - Usage widgets honor the uppercase `HTTPS_PROXY` environment variable for their direct API call to Anthropic.
- **🧠 New Thinking Effort widget (v2.2.4)** - Added a widget that shows the current Claude Code thinking effort level.
- **🍎 Better macOS usage lookup reliability (v2.2.5)** - Improved reliability when loading usage API tokens on macOS.
- **⌨️ New Vim Mode widget (v2.2.5)** - Added a widget that shows the current vim mode, with ASCII and optional Nerd Font icon display.
- **🔗 Git widget link modes (v2.2.6)** - `Git Branch` can render clickable GitHub branch links, and `Git Root Dir` can render clickable IDE links for VS Code and Cursor.
- **🤝 Better subagent-aware speed reporting** - Token speed calculations continue to include referenced subagent activity so displayed speeds better reflect actual concurrent work.

<br />
<details>
<summary><b>Older updates (v2.1.10 and earlier)</b></summary>

### v2.1.0 - v2.1.10 - Usage widgets, links, new git insertions / deletions widgets, and reliability fixes

- **🧩 New Usage widgets (v2.1.0)** - Added **Session Usage**, **Weekly Usage**, **Block Reset Timer**, and **Context Bar** widgets.
- **📊 More accurate counts (v2.1.0)** - Usage/context widgets now use new statusline JSON metrics when available for more accurate token and context counts.
- **🪟 Windows empty file bug fix (v2.1.1)** - Fixed a Windows issue that could create an empty `c:\dev\null` file.
- **🔗 New Link widget (v2.1.3)** - Added a new **Link** widget with clickable OSC8 rendering, preview parity, and raw mode support.
- **➕ New Git Insertions widget (v2.1.4)** - Added a dedicated Git widget that shows only uncommitted insertions (e.g., `+42`).
- **➖ New Git Deletions widget (v2.1.4)** - Added a dedicated Git widget that shows only uncommitted deletions (e.g., `-10`).
- **🧠 Context format fallback fix (v2.1.6)** - When `context_window_size` is missing, context widgets now infer 1M models from long-context labels such as `[1m]` and `1M context` in model identifiers.
- **⏳ Weekly reset timer split (v2.1.7)** - Added a separate `Weekly Reset Timer` widget.
- **⚙️ Custom config file flag (v2.1.8)** - Added `--config <path>` support so ccstatusline can load/save settings from a custom file location.
- **🔣 Unicode separator hex input upgrade (v2.1.9)** - Powerline separator hex input now supports 4-6 digits (full Unicode code points up to `U+10FFFF`).
- **🌳 Bare repo worktree detection fix (v2.1.10)** - `Git Worktree` now correctly detects linked worktrees created from bare repositories.

### v2.0.26 - v2.0.29 - Performance, git internals, and workflow improvements

- **🧠 Memory Usage widget (v2.0.29)** - Added a new widget that shows current system memory usage (`Mem: used/total`).
- **⚡ Block timer cache (v2.0.28)** - Cache block timer metrics to reduce JSONL parsing on every render, with per-config hashed cache files and automatic 5-hour block invalidation.
- **🧱 Git widget command refactor (v2.0.28)** - Refactored git widgets to use shared git command helpers and expanded coverage for failure and edge-case tests.
- **🪟 Windows UTF-8 piped output fix (v2.0.28)** - Sets the Windows UTF-8 code page for piped status line rendering.
- **📁 Git Root Dir widget (v2.0.27)** - Added a new Git widget that shows the repository root directory name.
- **🏷️ Session Name widget (v2.0.26)** - Added a new widget that shows the current Claude Code session name from `/rename`.
- **🏠 Current Working Directory home abbreviation (v2.0.26)** - Added a `~` abbreviation option for CWD display in both preview and live rendering.
- **🧠 Context model suffix fix (v2.0.26)** - Context widgets now recognize the `[1m]` suffix across models, not just a single model path.
- **🧭 Widget picker UX updates (v2.0.26)** - Improved widget discovery/navigation and added clearer, safer clear-line behavior.
- **⌨️ TUI editor input fix (v2.0.26)** - Prevented shortcut/input leakage into widget editor flows.
- **📄 Repo docs update (v2.0.26)** - Migrated guidance from `CLAUDE.md` to `AGENTS.md` (with symlink compatibility).

### v2.0.16 - Add fish style path abbreviation toggle to Current Working Directory widget

### v2.0.15 - Block Timer calculation fixes

- Fix miscalculation in the block timer

### v2.0.14 - Add remaining mode toggle to Context Percentage widgets

- **Remaining Mode** - You can now toggle the Context Percentage widgets between usage percentage and remaining percentage when configuring them in the TUI by pressing the 'u' key.

### v2.0.12 - Custom Text widget now supports emojis

- **👾 Emoji Support** - You can now paste emoji into the custom text widget. You can also turn on the merge option to get emoji labels for your widgets like this:
  
![Emoji Support](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/emojiSupport.png)

### v2.0.11 - Unlimited Status Lines

- **🚀 No Line Limit** - Configure as many status lines as you need - the 3-line limitation has been removed

### v2.0.10 - Git Updates

- **🌳 Git Worktree widget** - Shows the active worktree name when working with git worktrees
- **👻 Hide 'no git' message toggle** - Git widgets now support hiding the 'no git' message when not in a repository (toggle with 'h' key while editing the widget)

### v2.0.8 - Powerline Auto-Alignment

![Powerline Auto-Alignment](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/autoAlign.png)

- **🎯 Widget Alignment** - Auto-align widgets across multiple status lines in Powerline mode for a clean, columnar layout (toggle with 'a' in Powerline Setup)

### v2.0.7 - Current Working Directory & Session Cost

![Current Working Directory and Session Cost](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/cwdAndSessionCost.png)

- **📁 Current Working Directory** - Display the current working directory with configurable segment display
  - Set the number of path segments to show (e.g., show only last 2 segments: `.../Personal/ccstatusline`)
  - Supports raw value mode for compact display
  - Automatically truncates long paths with ellipsis
- **💰 Session Cost Widget** - Track your Claude Code session costs (requires Claude Code 1.0.85+)
  - Displays total session cost in USD
  - Supports raw value mode (shows just `$X.YZ` vs `Cost: $X.YZ`)
  - Real-time cost tracking from Claude Code session data
  - Note: Cost may not update properly when using `/resume` (Claude Code limitation)
- **🐛 Bug Fixes**
  - Fixed Block Timer calculations for accurate time tracking across block boundaries
  - Improved widget editor stability with proper Ctrl+S handling
  - Enhanced cursor display in numeric input fields

### v2.0.2 - Block Timer Widget

![Block Timer](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/blockTimerSmall.png)

- **⏱️ Block Timer** - Track your progress through 5-hour Claude Code blocks
  - Displays time elapsed in current block as hours/minutes (e.g., "3hr 45m")
  - Progress bar mode shows visual completion percentage
  - Two progress bar styles: full width (32 chars) or compact (16 chars)
  - Automatically detects block boundaries from transcript timestamps

### v2.0.0 - Powerline Support & Enhanced Themes
- **⚡ Powerline Mode** - Beautiful Powerline-style status lines with arrow separators and customizable caps
- **🎨 Built-in Themes** - Multiple pre-configured themes that you can copy and customize
- **🌈 Advanced Color Support** - Basic (16), 256-color (with custom ANSI codes), and truecolor (with hex codes) modes
- **🔗 Widget Merging** - Merge multiple widgets together with or without padding for seamless designs
- **📦 Easy Installation** - Install directly with `npx` or `bunx` - no global package needed
- **🔤 Custom Separators** - Add multiple Powerline separators with custom hex codes for font support
- **🚀 Auto Font Install** - Automatic Powerline font installation with user consent

</details>

<br />

## ✨ Features

- **📊 Real-time Metrics** - Display model name, git branch, token usage, session duration, block timer, and more
- **🎨 Fully Customizable** - Choose what to display and customize colors for each element
- **⚡ Powerline Support** - Beautiful Powerline-style rendering with arrow separators, caps, and custom fonts
- **📐 Multi-line Support** - Configure multiple independent status lines
- **🖥️ Interactive TUI** - Built-in configuration interface using React/Ink
- **🔎 Fast Widget Picker** - Add/change widgets by category with search and ranked matching
- **⚙️ Global Options** - Apply consistent formatting across all widgets (padding, separators, bold, minimalist mode, and color overrides)
- **🚀 Cross-platform** - Works seamlessly with both Bun and Node.js
- **🔧 Flexible Configuration** - Supports custom Claude Code config directory via `CLAUDE_CONFIG_DIR` environment variable
- **📏 Smart Width Detection** - Automatically adapts to terminal width with flex separators
- **⚡ Zero Config** - Sensible defaults that work out of the box

<br />

## 🌐 Localizations

The localizations in this section are third-party forks maintained outside this repository. They are not maintained, reviewed, or endorsed by this repository, so review their code and releases before using them.

- 🌏 **中文版 (Chinese):** [ccstatusline-zh](https://github.com/huangguang1999/ccstatusline-zh)

<br />

## 🚀 Quick Start

### No installation needed! Use directly with npx or bunx:

```bash
# Run the configuration TUI with npm
npx -y ccstatusline@latest

# Or with Bun (faster)
bunx -y ccstatusline@latest
```

<br />
<details>
<summary><b>Configure ccstatusline</b></summary>

The interactive configuration tool provides a terminal UI where you can:
- Configure multiple separate status lines
- Add/remove/reorder status line widgets
- Customize colors for each widget
- Configure flex separator behavior
- Edit custom text widgets
- Install/uninstall to Claude Code settings
- Preview your status line in real-time

> 💡 **Tip:** Your settings are automatically saved to `~/.config/ccstatusline/settings.json`

> 🔧 **Custom Claude Config:** If your Claude Code configuration is in a non-standard location, set the `CLAUDE_CONFIG_DIR` environment variable:
> ```bash
> # Linux/macOS
> export CLAUDE_CONFIG_DIR=/custom/path/to/.claude
> ```

> 🌐 **Usage API proxy:** Usage widgets honor the uppercase `HTTPS_PROXY` environment variable for their direct API call to Anthropic.

> 🪟 **Windows Support:** PowerShell examples, installation notes, fonts, troubleshooting, WSL, and Windows Terminal configuration are in [docs/WINDOWS.md](docs/WINDOWS.md).

</details>

<details>
<summary><b>Claude Code settings.json format</b></summary>

When you install from the TUI, ccstatusline writes a `statusLine` command object to your Claude Code settings:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y ccstatusline@latest",
    "padding": 0
  }
}
```

Other supported command values are:
- `bunx -y ccstatusline@latest`
- `ccstatusline` (for self-managed/global installs)

</details>

> 💡 **Note:** These settings are applied during rendering and don't add widgets to your widget list. They provide a consistent look across your entire status line without modifying individual widget configurations.

> ⚠️ **VSCode Users:** If colors appear incorrect in the VSCode integrated terminal, the "Terminal › Integrated: Minimum Contrast Ratio" (`terminal.integrated.minimumContrastRatio`) setting is forcing a minimum contrast between foreground and background colors. You can adjust this setting to 1 to disable the contrast enforcement, or use a standalone terminal for accurate colors.

### ⏱️ Block Timer Widget

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
- Toggle between modes with the **(p)** key in the widgets editor

### 🔤 Raw Value Mode

Some widgets support "raw value" mode which displays just the value without a label:
- Normal: `Model: Claude 3.5 Sonnet` → Raw: `Claude 3.5 Sonnet`
- Normal: `Session: 2hr 15m` → Raw: `2hr 15m`
- Normal: `Block: 3hr 45m` → Raw: `3hr 45m`
- Normal: `Ctx: 18.6k` → Raw: `18.6k`

### ⌨️ Widget Editor Keybinds

Common controls in the line editor:
- `a` add widget
- `i` insert widget
- `Enter` enter/exit move mode
- `d` delete selected widget
- `r` toggle raw value (supported widgets)
- `m` cycle merge mode (`off` → `merge` → `merge no padding`)
- `x` open rules editor (define conditional property overrides)

Widget-specific shortcuts:
- **Git widgets**: `h` toggle hide `no git` output
- **Context % widgets**: `u` toggle used vs remaining display
- **Block Timer**: `p` cycle display mode (time/full bar/short bar)
- **Block Reset Timer**: `p` cycle display mode (time/full bar/short bar)
- **Weekly Reset Timer**: `p` cycle display mode (time/full bar/short bar)
- **Current Working Dir**: `h` home abbreviation, `s` segment editor, `f` fish-style path
- **Custom Command**: `e` command, `w` max width, `t` timeout, `p` preserve ANSI colors
- **Link**: `u` URL, `e` link text

---

### 📏 Widget Rules

Rules let you dynamically change widget properties based on conditions. For example, change the Context % widget to red when usage exceeds 75%, or highlight the Git Branch widget when on `main`.

#### Opening the Rules Editor

In the line editor, press `x` on any widget to open its rules editor.

#### How Rules Work

Rules follow an MS Office-style model:
- Rules are evaluated **top-to-bottom** in order
- Each matching rule's `apply` properties are merged onto the widget
- A rule with `stop: true` halts further evaluation when it matches
- The widget's base properties serve as defaults (no special "default rule" needed)

#### Rules Schema

```json
{
  "id": "context-1",
  "type": "context-percentage",
  "color": "white",
  "rules": [
    {
      "when": { "greaterThan": 75 },
      "apply": { "color": "red", "bold": true },
      "stop": true
    },
    {
      "when": { "greaterThan": 50 },
      "apply": { "color": "yellow" },
      "stop": true
    }
  ]
}
```

#### Available Operators

| Category | Operators | Example |
|----------|-----------|---------|
| **Numeric** | `>`, `>=`, `<`, `<=`, `=`, `≠` | `{ "greaterThan": 75 }` |
| **String** | `contains`, `starts with`, `ends with` | `{ "contains": "feature/" }` |
| **String (negated)** | `does not contain`, `does not start with`, `does not end with` | `{ "contains": "main", "not": true }` |
| **Boolean** | `is true`, `is false` | `{ "isTrue": true }` |
| **Set** | `in`, `not in` | `{ "in": ["main", "master", "develop"] }` |

#### Cross-Widget Conditions

Reference another widget's value using the `widget` property:

```json
{
  "when": { "widget": "git-branch", "in": ["main", "master"] },
  "apply": { "color": "cyan", "bold": true }
}
```

This rule changes the current widget's appearance based on the git branch name, even if the current widget is something else entirely (like Context %).

#### Applyable Properties

Rules can override any widget property:
- `color` - Foreground color
- `backgroundColor` - Background color
- `bold` - Bold text
- `hide` - Hide the widget entirely
- `rawValue` - Toggle raw value mode
- `merge` - Merge with adjacent widget
- `character` - Override display character
- Widget-specific metadata

#### Rules Editor Keybinds

The rules editor has two modes, toggled with `Tab`:

**Property Mode:**
- `↑↓` - Navigate rules
- `←→` - Open condition editor
- `a` - Add new rule
- `d` - Delete selected rule
- `Enter` - Move mode (reorder rules)
- `s` - Toggle stop flag
- `h` - Toggle hide
- `r` - Toggle raw value
- `m` - Cycle merge mode
- `c` - Clear property overrides
- `Tab` - Switch to color mode

**Color Mode:**
- `←→` - Cycle foreground color
- `↑↓` - Navigate rules
- `f` - Toggle foreground/background editing
- `b` - Toggle bold
- `h` - Enter hex color (truecolor terminals)
- `a` - Enter ANSI 256 color code
- `r` - Reset colors to base widget
- `Tab` - Switch to property mode

#### Editing Conditions

Press `←` or `→` in property mode to open the condition editor:

- **←→** cycles between fields: Widget → Operator → Value
- **↑↓** opens pickers (widget picker or operator picker)
- **Enter** saves the condition
- **ESC** cancels

The operator picker is organized by category (Numeric, String, Boolean, Set) — use `←→` to switch categories and `↑↓` to select an operator.

#### Example: Traffic Light Context %

```json
{
  "type": "context-percentage",
  "color": "green",
  "rules": [
    { "when": { "greaterThan": 80 }, "apply": { "color": "red", "bold": true }, "stop": true },
    { "when": { "greaterThan": 60 }, "apply": { "color": "yellow" }, "stop": true }
  ]
}
```
- 0-60%: Green (base color)
- 61-80%: Yellow
- 81-100%: Red + bold

#### Example: Highlight Protected Branches

```json
{
  "type": "git-branch",
  "color": "white",
  "rules": [
    { "when": { "in": ["main", "master", "production"] }, "apply": { "color": "cyan", "bold": true } },
    { "when": { "startsWith": "release/" }, "apply": { "color": "magenta" } }
  ]
}
```

#### Example: Cross-Widget Alert

```json
{
  "type": "model",
  "color": "white",
  "rules": [
    {
      "when": { "widget": "context-percentage", "greaterThan": 90 },
      "apply": { "color": "red", "bold": true }
    }
  ]
}
```
The Model widget turns red when context usage exceeds 90%.

---

### 🔧 Custom Widgets

#### Custom Text Widget
Add static text to your status line. Perfect for:
- Project identifiers
- Environment indicators (dev/prod)
- Personal labels or reminders

#### Custom Command Widget
Execute shell commands and display their output dynamically:
- Refreshes whenever the statusline is updated by Claude Code
- Receives the full Claude Code JSON data via stdin (model info, session ID, transcript path, etc.)
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

> ⚠️ **Important:** Commands should complete quickly to avoid delays. Long-running commands will be killed after the configured timeout. If you're not seeing output from your custom command, try increasing the timeout value (press 't' in the editor).

> 💡 **Tip:** Custom commands can be other Claude Code compatible status line formatters! They receive the same JSON via stdin that ccstatusline receives from Claude Code, allowing you to chain or combine multiple status line tools.

#### Link Widget
Create clickable links in terminals that support OSC 8 hyperlinks:
- `metadata.url` - target URL (http/https)
- `metadata.text` - optional display text (defaults to URL)
- Falls back to plain text when URL is missing or unsupported

---

### 🔗 Integration Example: ccusage

[ccusage](https://github.com/ryoppippi/ccusage) is a tool that tracks and displays Claude Code usage metrics. You can integrate it directly into your status line:

1. Add a Custom Command widget
2. Set command: `npx -y ccusage@latest statusline`
3. Set timeout: `5000` (5 seconds for initial download)
4. Enable "preserve colors" to keep ccusage's color formatting

![ccusage integration](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/ccusage.png)

> 📄 **How it works:** The command receives Claude Code's JSON data via stdin, allowing ccusage to access session information, model details, and transcript data for accurate usage tracking.

### ✂️ Smart Truncation

When terminal width is detected, status lines automatically truncate with ellipsis (...) if they exceed the available width, preventing line wrapping.
Truncation is ANSI/OSC-aware, so preserved color output and OSC 8 hyperlinks remain well-formed.

---

## 📖 API Documentation

Complete API documentation is generated using TypeDoc and includes detailed information about:

- **Core Types**: Configuration interfaces, widget definitions, and render contexts
- **Widget System**: All available widgets and their customization options  
- **Utility Functions**: Helper functions for rendering, configuration, and terminal handling
- **Status Line Rendering**: Core rendering engine and formatting options

### Generating Documentation

To generate the API documentation locally:

```bash
# Generate documentation
bun run docs

# Clean generated documentation
bun run docs:clean
```

The documentation will be generated in the `docs/` directory and can be viewed by opening `docs/index.html` in your web browser.

### Documentation Structure

- **Types**: Core TypeScript interfaces and type definitions
- **Widgets**: Individual widget implementations and their APIs
- **Utils**: Utility functions for configuration, rendering, and terminal operations
- **Main Module**: Primary entry point and orchestration functions

---

## 🛠️ Development

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git
- Node.js 14+ (optional, for running the built `dist/ccstatusline.js` binary or npm publishing)

### Setup

```bash
# Clone the repository
git clone https://github.com/sirmalloc/ccstatusline.git
cd ccstatusline

# Install dependencies
bun install
```

### Development Commands

```bash
# Run in TUI mode
bun run start

# Test piped mode with example payload
bun run example

# Run tests
bun test

# Run typecheck + eslint checks without modifying files
bun run lint

# Apply ESLint auto-fixes intentionally
bun run lint:fix

# Build for distribution
bun run build

# Generate TypeDoc documentation
bun run docs
```

### Configuration Files

- `~/.config/ccstatusline/settings.json` - ccstatusline UI/render settings
- `~/.claude/settings.json` - Claude Code settings (`statusLine` command object)
- `~/.cache/ccstatusline/block-cache-*.json` - block timer cache (keyed by Claude config directory hash)

If you use a custom Claude config location, set `CLAUDE_CONFIG_DIR` and ccstatusline will read/write that path instead of `~/.claude`.

### Build Notes

- Build target is Node.js 14+ (`dist/ccstatusline.js`)
- During install, `ink@6.2.0` is patched to fix backspace handling on macOS terminals

### 📁 Project Structure

```
ccstatusline/
├── src/
│   ├── ccstatusline.ts         # Main entry point
│   ├── tui/                    # React/Ink configuration UI
│   │   ├── App.tsx             # Root TUI component
│   │   ├── index.tsx           # TUI entry point
│   │   └── components/         # UI components
│   │       ├── MainMenu.tsx
│   │       ├── LineSelector.tsx
│   │       ├── ItemsEditor.tsx
│   │       ├── ColorMenu.tsx
│   │       ├── PowerlineSetup.tsx
│   │       └── ...
│   ├── widgets/                # Status line widget implementations
│   │   ├── Model.ts
│   │   ├── GitBranch.ts
│   │   ├── TokensTotal.ts
│   │   ├── OutputStyle.ts
│   │   └── ...
│   ├── utils/                  # Utility functions
│   │   ├── config.ts           # Settings management
│   │   ├── renderer.ts         # Core rendering logic
│   │   ├── powerline.ts        # Powerline font utilities
│   │   ├── colors.ts           # Color definitions
│   │   └── claude-settings.ts  # Claude Code integration (supports CLAUDE_CONFIG_DIR)
│   └── types/                  # TypeScript type definitions
│       ├── Settings.ts
│       ├── Widget.ts
│       ├── PowerlineConfig.ts
│       └── ...
├── dist/                       # Built files (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## Support

If ccstatusline is useful to you, consider buying me a coffee:

<a href="https://www.buymeacoffee.com/sirmalloc" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>


## 📄 License

[MIT](LICENSE) © Matthew Breedlove


## 👤 Author

**Matthew Breedlove**

- GitHub: [@sirmalloc](https://github.com/sirmalloc)


## 🔗 Related Projects

- [tweakcc](https://github.com/Piebald-AI/tweakcc) - Customize Claude Code themes, thinking verbs, and more.
- [ccusage](https://github.com/ryoppippi/ccusage) - Track and display Claude Code usage metrics.
- [codachi](https://github.com/vincent-k2026/codachi) - A tamagotchi-style statusline pet that grows with your context window.


## 🙏 Acknowledgments

- Built for use with [Claude Code CLI](https://claude.ai/code) by Anthropic
- Powered by [Ink](https://github.com/vadimdemedes/ink) for the terminal UI
- Made with ❤️ for the Claude Code community

<br />

## Star History

<a href="https://www.star-history.com/#sirmalloc/ccstatusline&Timeline">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sirmalloc/ccstatusline&type=Timeline&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sirmalloc/ccstatusline&type=Timeline" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sirmalloc/ccstatusline&type=Timeline" />
 </picture>
</a>

<div align="center">

### 🌟 Show Your Support

Give a ⭐ if this project helped you!

[![GitHub stars](https://img.shields.io/github/stars/sirmalloc/ccstatusline?style=social)](https://github.com/sirmalloc/ccstatusline/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/sirmalloc/ccstatusline?style=social)](https://github.com/sirmalloc/ccstatusline/network/members)
[![GitHub watchers](https://img.shields.io/github/watchers/sirmalloc/ccstatusline?style=social)](https://github.com/sirmalloc/ccstatusline/watchers)

[![npm version](https://img.shields.io/npm/v/ccstatusline.svg)](https://www.npmjs.com/package/ccstatusline)
[![npm downloads](https://img.shields.io/npm/dm/ccstatusline.svg)](https://www.npmjs.com/package/ccstatusline)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/sirmalloc/ccstatusline/blob/main/LICENSE)
[![Made with Bun](https://img.shields.io/badge/Made%20with-Bun-000000.svg?logo=bun)](https://bun.sh)

[![Issues](https://img.shields.io/github/issues/sirmalloc/ccstatusline)](https://github.com/sirmalloc/ccstatusline/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/sirmalloc/ccstatusline)](https://github.com/sirmalloc/ccstatusline/pulls)
[![Contributors](https://img.shields.io/github/contributors/sirmalloc/ccstatusline)](https://github.com/sirmalloc/ccstatusline/graphs/contributors)

### 💬 Connect

[Report Bug](https://github.com/sirmalloc/ccstatusline/issues) · [Request Feature](https://github.com/sirmalloc/ccstatusline/issues) · [Discussions](https://github.com/sirmalloc/ccstatusline/discussions)

</div>
