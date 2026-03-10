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

## 📚 Table of Contents

- [Recent Updates](#-recent-updates)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Windows Support](#-windows-support)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Development](#️-development)
- [Contributing](#-contributing)
- [License](#-license)
- [Related Projects](#-related-projects)

---

## 🆕 Recent Updates

### v2.2.0 - v2.2.4 - Token Speed + Skills widget updates

- **🚀 New Token Speed widgets** - Added three widgets: **Input Speed**, **Output Speed**, and **Total Speed**.
  - Each speed widget supports a configurable window of `0-120` seconds in the widget editor (`w` key).
  - `0` disables window mode and uses a full-session average speed.
  - `1-120` calculates recent speed over the selected rolling window.
- **🧩 New Skills widget controls (v2.2.1)** - Added configurable Skills modes (last/count/list), optional hide-when-empty behavior, and list-size limiting with most-recent-first ordering.
- **🌐 Usage API proxy support (v2.2.2)** - Usage widgets honor the uppercase `HTTPS_PROXY` environment variable for their direct API call to Anthropic.
- **🧠 New Thinking Effort widget (v2.2.4)** - Added a widget that shows the current Claude Code thinking effort level.
- **🤝 Better subagent-aware speed reporting** - Token speed calculations continue to include referenced subagent activity so displayed speeds better reflect actual concurrent work.

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

---

## ✨ Features

- **📊 Real-time Metrics** - Display model name, git branch, token usage, session duration, block timer, and more
- **🎨 Fully Customizable** - Choose what to display and customize colors for each element
- **⚡ Powerline Support** - Beautiful Powerline-style rendering with arrow separators, caps, and custom fonts
- **📐 Multi-line Support** - Configure multiple independent status lines
- **🖥️ Interactive TUI** - Built-in configuration interface using React/Ink
- **🔎 Fast Widget Picker** - Add/change widgets by category with search and ranked matching
- **⚙️ Global Options** - Apply consistent formatting across all widgets (padding, separators, bold, background)
- **🚀 Cross-platform** - Works seamlessly with both Bun and Node.js
- **🔧 Flexible Configuration** - Supports custom Claude Code config directory via `CLAUDE_CONFIG_DIR` environment variable
- **📏 Smart Width Detection** - Automatically adapts to terminal width with flex separators
- **⚡ Zero Config** - Sensible defaults that work out of the box

---

## 🚀 Quick Start

### No installation needed! Use directly with npx or bunx:

```bash
# Run the configuration TUI with npm
npx -y ccstatusline@latest

# Or with Bun (faster)
bunx -y ccstatusline@latest
```

### Configure ccstatusline

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
> 
> # Windows PowerShell
> $env:CLAUDE_CONFIG_DIR="C:\custom\path\.claude"
> ```

> 🌐 **Usage API proxy:** Usage widgets honor the uppercase `HTTPS_PROXY` environment variable for their direct API call to Anthropic.

### Claude Code settings.json format

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

---

## 🪟 Windows Support

ccstatusline works seamlessly on Windows with full feature compatibility across PowerShell (5.1+ and 7+), Command Prompt, and Windows Subsystem for Linux (WSL).

### Installation on Windows

#### Option 1: Using Bun (Recommended)
```powershell
# Install Bun for Windows
irm bun.sh/install.ps1 | iex

# Run ccstatusline
bunx -y ccstatusline@latest
```

#### Option 2: Using Node.js
```powershell
# Using npm
npx -y ccstatusline@latest

# Or with Yarn
yarn dlx ccstatusline@latest

# Or with pnpm
pnpm dlx ccstatusline@latest
```

### Windows-Specific Features

#### Powerline Font Support
For optimal Powerline rendering on Windows:

**Windows Terminal** (Recommended):
- Supports Powerline fonts natively
- Download from [Microsoft Store](https://aka.ms/terminal)
- Auto-detects compatible fonts

**PowerShell/Command Prompt**:
```powershell
# Install JetBrains Mono Nerd Font via winget
winget install DEVCOM.JetBrainsMonoNerdFont

# Alternative: Install base JetBrains Mono font
winget install "JetBrains.JetBrainsMono"

# Or download manually from: https://www.nerdfonts.com/font-downloads
```

#### Path Handling
ccstatusline automatically handles Windows-specific paths:
- Git repositories work with both `/` and `\` path separators
- Current Working Directory widget displays Windows-style paths correctly
- Full support for mapped network drives and UNC paths
- Handles Windows drive letters (C:, D:, etc.)

### Windows Troubleshooting

#### Common Issues & Solutions

**Issue**: Powerline symbols showing as question marks or boxes
```powershell
# Solution: Install a compatible Nerd Font
winget install JetBrainsMono.NerdFont
# Then set the font in your terminal settings
```

**Issue**: Git commands not recognized
```powershell
# Check if Git is installed and in PATH
git --version

# If not found, install Git:
winget install Git.Git
# Or download from: https://git-scm.com/download/win
```

**Issue**: Permission errors during installation
```powershell
# Use non-global installation (recommended)
npx -y ccstatusline@latest

# Or run PowerShell as Administrator for global install
```

**Issue**: "Execution Policy" errors in PowerShell
```powershell
# Temporarily allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Issue**: Windows Defender blocking execution
```powershell
# If Windows Defender flags the binary:
# 1. Open Windows Security
# 2. Go to "Virus & threat protection"
# 3. Add exclusion for the ccstatusline binary location
# Or use temporary bypass (not recommended for production):
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.bun\bin"
```

#### Windows Subsystem for Linux (WSL)
ccstatusline works perfectly in WSL environments:

```bash
# Install in WSL Ubuntu/Debian
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bunx -y ccstatusline@latest
```

**WSL Benefits**:
- Native Unix-style path handling
- Better font rendering in WSL terminals
- Seamless integration with Linux development workflows

### Windows Terminal Configuration

For the best experience, configure Windows Terminal with these recommended settings:

#### Terminal Settings (settings.json)
```json
{
  "profiles": {
    "defaults": {
      "font": {
        "face": "JetBrainsMono Nerd Font",
        "size": 12
      },
      "colorScheme": "One Half Dark"
    }
  }
}
```

#### Claude Code Integration
Configure ccstatusline in your Claude Code settings:

**Settings Location:**
- Default: `~/.claude/settings.json` (Windows: `%USERPROFILE%\.claude\settings.json`)
- Custom: Set `CLAUDE_CONFIG_DIR` environment variable to use a different directory

**For Bun users**:
```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx -y ccstatusline@latest",
    "padding": 0
  }
}
```

**For npm users**:
```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y ccstatusline@latest",
    "padding": 0
  }
}
```

> 💡 **Custom Config Directory:** If you use a non-standard Claude Code configuration directory, set the `CLAUDE_CONFIG_DIR` environment variable before running ccstatusline. The tool will automatically detect and use your custom location.

### Performance on Windows

ccstatusline includes Windows-specific runtime behavior:
- **UTF-8 piped output fix**: In piped mode, it attempts to set code page `65001` for reliable symbol rendering
- **Path compatibility**: Git and CWD widgets handle both `/` and `\` separators
- **Block timer cache**: Cached block metrics reduce repeated JSONL scanning

### Windows-Specific Widget Behavior

Some widgets have Windows-specific optimizations:

- **Current Working Directory**: Displays Windows drive letters and UNC paths
- **Git Widgets**: Handle Windows line endings (CRLF) automatically  
- **Custom Commands**: Support both PowerShell and cmd.exe commands
- **Block Timer**: Accounts for Windows timezone handling

---

## 📖 Usage

Once configured, ccstatusline automatically formats your Claude Code status line. The status line appears at the bottom of your terminal during Claude Code sessions.

### Runtime Modes

- **Interactive mode (TUI)**: Launches when there is no stdin input
- **Piped mode (renderer)**: Parses Claude Code status JSON from stdin and prints one or more formatted lines

```bash
# Interactive TUI
bun run start

# Piped mode with example payload
bun run example
```

### 📊 Available Widgets

- **Model** - Displays the Claude model name (e.g., "Claude 3.5 Sonnet")
- **Output Style** - Shows the current Claude Code output style
- **Git Branch** - Shows the current git branch name
- **Git Changes** - Shows git changes count (`+insertions`, `-deletions`)
- **Git Insertions** - Shows git insertions count
- **Git Deletions** - Shows git deletions count
- **Git Root Dir** - Shows the git repository root directory name
- **Git Worktree** - Shows the current git worktree name
- **Current Working Dir** - Shows current working directory with segment limit, fish-style abbreviation, and optional `~` home abbreviation
- **Tokens Input** - Shows input token count for the current session
- **Tokens Output** - Shows output token count for the current session
- **Tokens Cached** - Shows cached token count for the current session
- **Tokens Total** - Shows total token count (`input + output + cache`) for the current session
- **Input Speed** - Shows session-average input token speed (`tokens/sec`) with optional per-widget window (`0-120` seconds; `0` = full-session average)
- **Output Speed** - Shows session-average output token speed (`tokens/sec`) with optional per-widget window (`0-120` seconds; `0` = full-session average)
- **Total Speed** - Shows session-average total token speed (`tokens/sec`) with optional per-widget window (`0-120` seconds; `0` = full-session average)
- **Context Length** - Shows the current context window size in tokens
- **Context %** - Shows percentage of context window used or remaining
- **Context % (usable)** - Shows percentage of usable context used or remaining (80% of max before auto-compact)
- **Session Clock** - Shows elapsed time since current session started
- **Session Cost** - Shows the total session cost in USD
- **Block Timer** - Shows current 5-hour block elapsed time or progress
- **Terminal Width** - Shows current terminal width in columns
- **Version** - Shows Claude Code CLI version number
- **Custom Text** - Displays user-defined custom text
- **Custom Command** - Executes a custom shell command and displays output (refreshes whenever Claude Code updates the status line)
- **Link** - Displays a clickable terminal hyperlink using OSC 8
- **Claude Session ID** - Shows the current Claude Code session ID from status JSON
- **Session Name** - Shows the session name set via `/rename` in Claude Code
- **Memory Usage** - Shows system memory usage (used/total)
- **Session Usage** - Shows daily/session API usage percentage
- **Weekly Usage** - Shows weekly API usage percentage
- **Block Reset Timer** - Shows time remaining until current 5-hour block reset window
- **Weekly Reset Timer** - Shows time remaining until weekly usage reset
- **Context Bar** - Shows context usage as a progress bar with short/full display modes
- **Skills** - Shows skill activity as last used, total count, or unique list (with optional list limit and hide-when-empty toggle)
- **Separator** - Visual divider between widgets (available when Powerline mode is off and no default separator is configured)
- **Flex Separator** - Expands to fill available space (available when Powerline mode is off)

---

### Terminal Width Options
These settings affect where long lines are truncated, and where right-alignment occurs when using flex separators:
- **Full width always** - Uses full terminal width (may wrap if auto-compact message appears or IDE integration adds text)
- **Full width minus 40** - Reserves 40 characters for auto-compact message to prevent wrapping (default)
- **Full width until compact** - Dynamically switches between full width and minus 40 based on context percentage threshold (configurable, default 60%)

---

### ⚙️ Global Options

Configure global formatting preferences that apply to all widgets:

![Global Options](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/global.png)

#### Default Padding & Separators
- **Default Padding** - Add consistent padding to the left and right of each widget
- **Default Separator** - Automatically insert a separator between all widgets
  - Press **(p)** to edit padding
  - Press **(s)** to edit separator

<details>
<summary><b>Global Formatting Options</b></summary>

- **Inherit Colors** - Default separators inherit foreground and background colors from the preceding widget
  - Press **(i)** to toggle
- **Global Bold** - Apply bold formatting to all text regardless of individual widget settings
  - Press **(o)** to toggle
- **Override Foreground Color** - Force all widgets to use the same text color
  - Press **(f)** to cycle through colors
  - Press **(g)** to clear override
- **Override Background Color** - Force all widgets to use the same background color
  - Press **(b)** to cycle through colors
  - Press **(c)** to clear override

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

---

## Support

If ccstatusline is useful to you, consider buying me a coffee:

<a href="https://www.buymeacoffee.com/sirmalloc" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

---

## 📄 License

[MIT](LICENSE) © Matthew Breedlove

---

## 👤 Author

**Matthew Breedlove**

- GitHub: [@sirmalloc](https://github.com/sirmalloc)

---

## 🔗 Related Projects

- [tweakcc](https://github.com/Piebald-AI/tweakcc) - Customize Claude Code themes, thinking verbs, and more.
- [ccusage](https://github.com/ryoppippi/ccusage) - Track and display Claude Code usage metrics.

---

## 🙏 Acknowledgments

- Built for use with [Claude Code CLI](https://claude.ai/code) by Anthropic
- Powered by [Ink](https://github.com/vadimdemedes/ink) for the terminal UI
- Made with ❤️ for the Claude Code community

---

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
