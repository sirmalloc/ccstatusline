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

![Demo](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/demo.gif)

</div>

## 🚦 Start Here

- **Install + launch TUI:** `npx -y ccstatusline@latest` or `bunx -y ccstatusline@latest`
- **Hook into Claude Code:** add a `statusLine` command object (example in [Quick Start](#-quick-start))
- **Most users only need:** Quick Start + Usage
- **Everything else:** Advanced sections are collapsed below

## 📚 Table of Contents

- [Quick Start](#-quick-start)
- [Features](#-features)
- [Usage](#-usage)
- [Recent Updates](#-recent-updates)
- [Windows Support](#-windows-support)
- [API Documentation](#-api-documentation)
- [Development](#️-development)
- [Contributing](#-contributing)
- [License](#-license)
- [Related Projects](#-related-projects)

---

## 🚀 Quick Start

### Run the configuration TUI

```bash
# npm
npx -y ccstatusline@latest

# bun
bunx -y ccstatusline@latest
```

### Configure in TUI

The interactive TUI lets you:
- Configure any number of status lines
- Add/remove/reorder widgets
- Customize colors, separators, and powerline settings
- Preview output in real time
- Install/uninstall in Claude Code settings

> 💡 Settings are saved to `~/.config/ccstatusline/settings.json`.

### Claude Code `settings.json` snippet

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y ccstatusline@latest",
    "padding": 0
  }
}
```

Supported `command` values:
- `npx -y ccstatusline@latest`
- `bunx -y ccstatusline@latest`
- `ccstatusline` (self-managed/global installs)

### Custom Claude config directory

If your Claude config is not in `~/.claude`, set `CLAUDE_CONFIG_DIR`:

```bash
# Linux/macOS
export CLAUDE_CONFIG_DIR=/custom/path/to/.claude
```

```powershell
# Windows PowerShell
$env:CLAUDE_CONFIG_DIR="C:\custom\path\.claude"
```

---

## ✨ Features

- **📊 Real-time Metrics** - Model, git, tokens, context, session clock/cost, memory, and more
- **🎨 Fully Customizable** - Per-widget colors, background, bold, merge options, and separators
- **⚡ Powerline Support** - Powerline separators/caps, themes, auto-align, optional font install flow
- **📐 Multi-line Support** - Configure multiple independent status lines
- **🖥️ Interactive TUI** - React/Ink editor with live preview
- **🔎 Fast Widget Picker** - Category + search based widget discovery
- **⚙️ Global Options** - Shared padding, separators, and color overrides
- **🚀 Cross-platform** - Bun and Node compatible runtime
- **📏 Smart Width Handling** - Flex separator + truncation support for constrained terminals

---

## 📖 Usage

Once configured, ccstatusline formats your Claude Code status line automatically.

### Runtime modes

- **Interactive mode (TUI):** no stdin input
- **Piped mode (renderer):** reads Claude status JSON from stdin and prints formatted lines

```bash
# Interactive TUI
bun run start

# Piped mode with example payload
bun run example
```

### High-impact widgets

- `Model`, `Output Style`, `Version`
- `Git Branch`, `Git Changes`, `Git Root Dir`, `Git Worktree`
- `Tokens Input/Output/Cached/Total`
- `Context Length`, `Context %`, `Context % (usable)`
- `Session Clock`, `Session Cost`, `Session Name`, `Claude Session ID`
- `Block Timer`, `Current Working Dir`, `Memory Usage`
- `Custom Text`, `Custom Command`

### Smart truncation + width modes

Long lines are truncated with ellipsis to avoid wrapping when terminal width can be detected.

- **Full width always**
- **Full width minus 40** (default)
- **Full width until compact** (uses configurable context threshold)

<details>
<summary><b>Full Widget Catalog (click to expand)</b></summary>

- **Model Name** - Shows the current Claude model
- **Git Branch** - Displays current git branch name
- **Git Changes** - Shows uncommitted insertions/deletions
- **Git Root Dir** - Shows git repository root directory name
- **Git Worktree** - Shows current git worktree name
- **Session Clock** - Shows elapsed time since session start
- **Session Cost** - Shows total session cost in USD
- **Session Name** - Shows session name set via `/rename`
- **Claude Session ID** - Shows session ID from status JSON
- **Block Timer** - Shows elapsed time or progress bar in 5-hour block
- **Current Working Directory** - Path with segment/fish-style/home abbreviation options
- **Version** - Shows Claude Code version
- **Output Style** - Shows current Claude output style
- **Tokens Input** - Input token count
- **Tokens Output** - Output token count
- **Tokens Cached** - Cached token count
- **Tokens Total** - Total token count
- **Context Length** - Current context length
- **Context Percentage** - Percent of max context used (`[1m]` model IDs use 1M)
- **Context Percentage (usable)** - Percent of usable context used (80% ceiling)
- **Terminal Width** - Detected terminal width
- **Memory Usage** - Used/total memory
- **Custom Text** - Static custom text
- **Custom Command** - Execute command and display output
- **Separator** - Manual separator (`|`, `-`, `,`, space)
- **Flex Separator** - Expands to consume available width

</details>

<details>
<summary><b>Widget Editor Keybinds (click to expand)</b></summary>

Common line editor controls:
- `a` add widget
- `i` insert widget
- `Enter` enter/exit move mode
- `d` delete selected widget
- `r` toggle raw value (supported widgets)
- `m` cycle merge mode (`off` → `merge` → `merge no padding`)

Widget-specific shortcuts:
- **Git widgets:** `h` toggle hide `no git` output
- **Context % widgets:** `l` toggle used vs remaining mode
- **Block Timer:** `p` cycle display mode (time/full bar/short bar)
- **Current Working Dir:** `h` home abbreviation, `s` segments editor, `f` fish style
- **Custom Command:** `e` edit command, `w` width, `t` timeout, `p` preserve ANSI colors

</details>

<details>
<summary><b>Global Options and Block Timer Details (click to expand)</b></summary>

**Global options**

![Global Options](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/global.png)

- **Default Padding** - Add consistent left/right padding
- **Default Separator** - Insert separator between widgets
- **Inherit Colors** - Separator inherits colors from preceding widget
- **Global Bold** - Force bold on all widget text
- **Override FG/BG** - Force global foreground/background colors

> ⚠️ VSCode users: `terminal.integrated.minimumContrastRatio` can alter ANSI appearance.

**Block Timer widget**

![Block Timer](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/blockTimer.png)

Display modes:
- Time (`3hr 45m`)
- Progress bar (32 chars)
- Progress bar short (16 chars)

Behavior:
- Detects 5-hour block boundaries from transcript timestamps
- Floors block start to the hour
- Supports raw value mode
- Uses cached block metrics for performance

</details>

<details>
<summary><b>Custom Widgets + Command Deep Dive (click to expand)</b></summary>

**Custom Text**

Use for labels, environment markers, and project tags.

**Custom Command**

- Runs command on each statusline render
- Receives full Claude status JSON on stdin
- Supports timeout (default `1000ms`)
- Supports max width truncation
- Supports ANSI color preservation (`preserve colors`)

Examples:
- `pwd | xargs basename`
- `git rev-parse --short HEAD`
- `date +%H:%M`
- `npx -y ccusage@latest statusline`

> Long-running commands are terminated at timeout.

**ccusage integration**

1. Add a `Custom Command` widget
2. Set command: `npx -y ccusage@latest statusline`
3. Set timeout: `5000`
4. Enable preserve colors

![ccusage integration](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/ccusage.png)

</details>

---

## 🆕 Recent Updates

### v2.0.26 - v2.0.29

- **🧠 Memory Usage widget (v2.0.29)**
- **⚡ Block timer cache (v2.0.28)**
- **🧱 Git command helper refactor + tests (v2.0.28)**
- **🪟 Windows UTF-8 piped output fix (v2.0.28)**
- **📁 Git Root Dir widget (v2.0.27)**
- **🏷️ Session Name widget (v2.0.26)**
- **🏠 CWD `~` abbreviation option (v2.0.26)**
- **🧠 `[1m]` model suffix context fix (v2.0.26)**
- **🧭 Widget picker UX updates (v2.0.26)**

<details>
<summary><b>Older Release Notes (click to expand)</b></summary>

**v2.0.16**
- Fish-style path abbreviation toggle for Current Working Directory

**v2.0.15**
- Block Timer calculation fixes

**v2.0.14**
- Remaining mode toggle for Context Percentage widgets (`l` key)

**v2.0.12**
- Custom Text emoji support

![Emoji Support](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/emojiSupport.png)

**v2.0.11**
- Removed 3-line limit; unlimited status lines

**v2.0.10**
- Git Worktree widget
- Hide `no git` toggle for git widgets (`h`)

**v2.0.8**
- Powerline auto-alignment (`a` toggle)

![Powerline Auto-Alignment](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/autoAlign.png)

**v2.0.7**
- Current Working Directory widget
- Session Cost widget

![Current Working Directory and Session Cost](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/cwdAndSessionCost.png)

**v2.0.2**
- Block Timer widget

![Block Timer](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/blockTimerSmall.png)

**v2.0.0**
- Powerline mode, themes, advanced color support, mergeable widgets

</details>

---

## 🪟 Windows Support

ccstatusline works in PowerShell (5.1+ / 7+), Command Prompt, and WSL.

- Bun install/run: `irm bun.sh/install.ps1 | iex` then `bunx -y ccstatusline@latest`
- npm run: `npx -y ccstatusline@latest`

<details>
<summary><b>Windows Setup, Troubleshooting, and Terminal Notes (click to expand)</b></summary>

**Powerline fonts**

- Prefer Windows Terminal for best font support
- Nerd Font example:

```powershell
winget install DEVCOM.JetBrainsMonoNerdFont
```

**Troubleshooting**

**Powerline symbols show boxes**
```powershell
winget install JetBrainsMono.NerdFont
```

**Git not found**
```powershell
git --version
winget install Git.Git
```

**Execution policy errors**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**WSL**

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bunx -y ccstatusline@latest
```

**Windows Terminal sample profile**

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

**Runtime notes**

- Attempts UTF-8 code page `65001` in piped mode
- Git/CWD widgets support both `/` and `\\`
- Block timer uses cached metrics to reduce repeated JSONL scans

</details>

---

## 📖 API Documentation

TypeDoc can be generated locally:

```bash
bun run docs
bun run docs:clean
```

<details>
<summary><b>Documentation Scope (click to expand)</b></summary>

- Core types and schemas
- Widget interfaces and implementations
- Rendering/configuration utility APIs
- Main orchestration module

</details>

---

## 🛠️ Development

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git
- Node.js 14+ (optional, for running built `dist/ccstatusline.js`)

### Setup

```bash
git clone https://github.com/sirmalloc/ccstatusline.git
cd ccstatusline
bun install
```

### Development commands

```bash
# TUI mode
bun run start

# Piped mode example
bun run example

# Tests
bun test
bun run vitest

# Typecheck + eslint (auto-fix)
bun run lint

# Build
bun run build

# Docs
bun run docs
```

<details>
<summary><b>Configuration Files, Build Notes, and Project Structure (click to expand)</b></summary>

**Configuration files**

- `~/.config/ccstatusline/settings.json` - ccstatusline settings
- `~/.claude/settings.json` - Claude Code `statusLine` command object
- `~/.cache/ccstatusline/block-cache-*.json` - block timer cache files

If using a non-standard Claude config directory, set `CLAUDE_CONFIG_DIR`.

**Build notes**

- Build target: Node.js 14+ (`dist/ccstatusline.js`)
- `ink@6.2.0` is patched during install for macOS backspace handling

**Project structure**

```text
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

</details>

---

## 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add some amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Open a pull request

---

## 📄 License

[MIT](LICENSE) © Matthew Breedlove

## 👤 Author

**Matthew Breedlove**

- GitHub: [@sirmalloc](https://github.com/sirmalloc)

---

## 🔗 Related Projects

- [tweakcc](https://github.com/Piebald-AI/tweakcc) - Customize Claude Code themes, thinking verbs, and more.
- [ccusage](https://github.com/ryoppippi/ccusage) - Track and display Claude Code usage metrics.

---

## 🙏 Acknowledgments

- Built for [Claude Code CLI](https://claude.ai/code)
- Powered by [Ink](https://github.com/vadimdemedes/ink)
- Made with ❤️ for the Claude Code community

## 💛 Support

If ccstatusline is useful to you, consider buying me a coffee:

<a href="https://www.buymeacoffee.com/sirmalloc" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## Star History

<div align="center">
<a href="https://www.star-history.com/#sirmalloc/ccstatusline&Timeline">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=sirmalloc/ccstatusline&type=Timeline&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=sirmalloc/ccstatusline&type=Timeline" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=sirmalloc/ccstatusline&type=Timeline" />
 </picture>
</a>
</div>

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
