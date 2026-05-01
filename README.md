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
- [Development](docs/DEVELOPMENT.md)
- [Contributing](#-contributing)
- [License](#-license)
- [Related Projects](#-related-projects)

<br />

## 🆕 Recent Updates

### v2.2.9 - v2.2.12 - GitLab support, reset timers, context, compaction, and git widgets

- **🦊 GitLab PR/MR support** - `Git Branch` and `Git PR/MR` now support GitHub, GitLab, and compatible self-hosted remotes, using `gh` or `glab` as appropriate.
- **🔄 Status line refresh interval** - Installed configs can set Claude Code's `statusLine.refreshInterval` from the TUI when Claude Code >=2.1.97 supports it.
- **🧭 Wrap-around TUI navigation** - Menu/list navigation and move/reorder modes now wrap at the first and last items.
- **📋 Clone widget shortcut** - Press `k` in the item editor to duplicate the selected widget, with fresh Powerline background color for cloned Powerline items.
- **📊 Short bar display modes** - Context percentage, Context Bar, Session Usage, Weekly Usage, Block Timer, and reset timer widgets can use compact bar variants.
- **⏱️ Usage time cursor** - Session Usage and Weekly Usage progress bars can show the elapsed time position within the current usage window.
- **🕒 Reset timer timestamps** - Block and Weekly Reset Timer widgets can show exact reset timestamps with compact formatting, 12/24-hour display, IANA time zones, and locale selection.
- **🪟 Context Window widget** - Added a `Context Window` widget for total model window size, keeping `Context Length` focused on current context usage.
- **🔁 Compaction Counter widget** - Added a `Compaction Counter` widget that tracks session context compactions, with icon/text/number formats, optional Nerd Font icon, and hide-when-zero behavior.
- **🧮 Git file status widgets** - Added `Git Staged Files`, `Git Unstaged Files`, `Git Untracked Files`, and `Git Clean Status` for file counts and clean/dirty state.
- **🏷️ Clear context percentage labels** - `Context %` and `Context % (usable)` now label rendered values as used or left when toggling used/remaining mode.
- **⚡ More Powerline caps** - The Powerline separator editor now supports more than three start/end caps.
- **🧠 Thinking Effort updates** - Added `xhigh`, show `default` when no effort is set, mark unknown future effort levels with `?`, and track live status JSON plus `/effort` command changes.
- **🧮 More accurate token counts** - Streaming duplicate JSONL entries are deduped so token widgets do not overcount live Claude Code output.
- **🏷️ Cleaner model display** - The Model widget strips trailing context suffixes like `(1M context)`; use `Context Window` when you want the total window size shown.
- **🧹 Cleaner empty-widget separators** - Manual separators now collapse around widgets that render empty, avoiding dangling separators when hide-when-empty widgets disappear.
- **🧱 More resilient Git helpers** - Git widgets handle missing or unusual git command output more defensively.

### v2.2.8 - Git widgets, smarter picker search, and minimalist mode

- **🔀 New Git PR widget** - Added a `Git PR` widget with clickable PR links plus optional status and title display for the current branch.
- **🧰 Major Git widget expansion** - Added `Git Status`, `Git Staged`, `Git Unstaged`, `Git Untracked`, `Git Ahead/Behind`, `Git Conflicts`, `Git SHA`, `Git Origin Owner`, `Git Origin Repo`, `Git Origin Owner/Repo`, `Git Upstream Owner`, `Git Upstream Repo`, `Git Upstream Owner/Repo`, `Git Is Fork`, `Git Worktree Mode`, `Git Worktree Name`, `Git Worktree Branch`, `Git Worktree Original Branch`, and `Custom Symbol`.
- **👤 Claude Account Email widget** - Added a session widget that reads the signed-in Claude account email from `~/.claude.json` while respecting `CLAUDE_CONFIG_DIR`.
- **🧼 Global Minimalist Mode** - Added a global toggle in `Global Overrides` that forces widgets into raw-value mode for a cleaner, label-free status line.
- **🔎 Smarter widget picker search** - The add/change widget picker now supports substring, initialism, and fuzzy matching, with ranked results and live match highlighting.
- **📏 Better terminal width detection** - Flex separators and right-alignment now work more reliably when ccstatusline is launched through wrapper processes or nested PTYs.
- **🎨 Powerline theme continuity** - Built-in Powerline themes can now continue colors cleanly across multiple status lines instead of restarting each line.

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

- **📊 Real-time Metrics** - Display model name, git branch, token usage, session duration, compaction count, block timer, and more
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

### Build from source (for custom/forked versions):

```bash
git clone git@github.com:godlockin/ccstatusline.git
cd ccstatusline
./install.sh
```

`install.sh` builds the project with Bun and automatically wires the local binary into `~/.claude/settings.json`. Restart Claude Code after running it.

<br />
<details>
<summary><b>Configure ccstatusline</b></summary>

The interactive configuration tool provides a terminal UI where you can:
- Configure multiple separate status lines
- Add/remove/reorder status line widgets
- Customize colors for each widget
- Configure flex separator behavior
- Configure Claude Code status line refresh interval when supported
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
    "padding": 0,
    "refreshInterval": 10
  }
}
```

`refreshInterval` is written only when your Claude Code version supports it (>=2.1.97). The TUI can set it to `1-60` seconds, or remove it by leaving the input empty.

Other supported command values are:
- `bunx -y ccstatusline@latest`
- `ccstatusline` (for self-managed/global installs)

</details>

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
