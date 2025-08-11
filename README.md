# ccstatusline

> 🎨 A highly customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics in your terminal.

![Demo](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/demo.gif)

## ✨ Features

- **📊 Real-time Metrics** - Display model name, git branch, token usage, session duration, and more
- **🎨 Fully Customizable** - Choose what to display and customize colors for each element
- **📐 Multi-line Support** - Configure up to 3 independent status lines
- **🖥️ Interactive TUI** - Built-in configuration interface using React/Ink
- **🚀 Cross-platform** - Works seamlessly with both Bun and Node.js
- **📏 Smart Width Detection** - Automatically adapts to terminal width with flex separators
- **⚡ Zero Config** - Sensible defaults that work out of the box

## 🚀 Quick Start

### No installation needed! Use directly with npx:

```bash
# Run the configuration TUI
npx ccstatusline@latest
```

### Configure ccstatusline

The interactive configuration tool provides a terminal UI where you can:
- Configure up to 3 separate status lines
- Add/remove/reorder status line items
- Customize colors for each element
- Configure flex separator behavior
- Edit custom text items
- Install/uninstall to Claude Code settings
- Preview your status line in real-time

> 💡 **Tip:** Your settings are automatically saved to `~/.config/ccstatusline/settings.json`

## 📖 Usage

Once configured, ccstatusline automatically formats your Claude Code status line. The status line appears at the bottom of your terminal during Claude Code sessions.

### 📊 Available Status Items

- **Model Name** - Shows the current Claude model (e.g., "Claude 3.5 Sonnet")
- **Git Branch** - Displays current git branch name
- **Git Changes** - Shows uncommitted insertions/deletions (e.g., "+42,-10")
- **Session Clock** - Shows elapsed time since session start (e.g., "2hr 15m")
- **Version** - Shows Claude Code version
- **Tokens Input** - Shows input tokens used
- **Tokens Output** - Shows output tokens used
- **Tokens Cached** - Shows cached tokens used
- **Tokens Total** - Shows total tokens used
- **Context Length** - Shows current context length in tokens
- **Context Percentage** - Shows percentage of context limit used
- **Terminal Width** - Shows detected terminal width (for debugging)
- **Custom Text** - Add your own custom text to the status line
- **Custom Command** - Execute shell commands and display their output (refreshes whenever the statusline is updated by Claude Code)
- **Separator** - Visual divider between items (customizable: |, -, comma, space)
- **Flex Separator** - Expands to fill available space

### ⌨️ TUI Controls

#### Main Menu
- **↑↓** - Navigate menu items
- **Enter** - Select item
- **Ctrl+C** - Exit

#### Line Editor
- **↑↓** - Select item
- **←→** - Change item type
- **Enter** - Enter move mode (reorder items)
- **a** - Add item at end
- **i** - Insert item before selected
- **d** - Delete selected item
- **c** - Clear entire line
- **r** - Toggle raw value mode (no labels)
- **e** - Edit value (for custom-text and custom-command items)
- **Space** - Change separator character (for separator items)
- **ESC** - Go back

#### Color Configuration
- **↑↓** - Select item
- **Enter** - Cycle through colors
- **ESC** - Go back

#### Flex Options
Configure how flex separators calculate available width:
- **Full width always** - Uses full terminal width (may wrap with auto-compact message)
- **Full width minus 40** - Leaves space for auto-compact message (default)
- **Full width until compact** - Switches based on context percentage threshold

### 🔤 Raw Value Mode

Some items support "raw value" mode which displays just the value without a label:
- Normal: `Model: Claude 3.5 Sonnet` → Raw: `Claude 3.5 Sonnet`
- Normal: `Session: 2hr 15m` → Raw: `2hr 15m`
- Normal: `Ctx: 18.6k` → Raw: `18.6k`

### 🔧 Custom Widgets

#### Custom Text Widget
Add static text to your status line. Perfect for:
- Project identifiers
- Environment indicators (dev/prod)
- Personal labels or reminders

#### Custom Command Widget
Execute shell commands and display their output dynamically:
- Refreshes whenever the statusline is updated by Claude Code
- Displays command output inline in your status line
- Examples:
  - `pwd | xargs basename` - Show current directory name
  - `node -v` - Display Node.js version
  - `git rev-parse --short HEAD` - Show current commit hash
  - `date +%H:%M` - Display current time
  - `curl -s wttr.in?format="%t"` - Show current temperature

> ⚠️ **Note:** Commands should complete quickly (<1s) to avoid delays. Long-running commands will be killed after timeout.

### ✂️ Smart Truncation

When terminal width is detected, status lines automatically truncate with ellipsis (...) if they exceed the available width, preventing line wrapping.

## 🛠️ Development

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git
- Node.js 18+ (optional, for npm publishing)

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/ccstatusline.git
cd ccstatusline

# Install dependencies
bun install
```

### Development Commands

```bash
# Run in TUI mode (configuration)
bun run src/ccstatusline.ts

# Build for distribution
bun run build
```

### 📁 Project Structure

```
ccstatusline/
├── src/
│   ├── ccstatusline.ts     # Main entry point
│   ├── tui.tsx             # React/Ink configuration UI
│   ├── config.ts           # Settings management
│   └── claude-settings.ts  # Claude Code settings integration
├── dist/                   # Built files (generated)
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

## 📄 License

[MIT](LICENSE) © Matthew Breedlove

## 👤 Author

**Matthew Breedlove**

- GitHub: [@sirmalloc](https://github.com/sirmalloc)

## 🙏 Acknowledgments

- Built for use with [Claude Code CLI](https://claude.ai/code) by Anthropic
- Powered by [Ink](https://github.com/vadimdemedes/ink) for the terminal UI
- Made with ❤️ for the Claude Code community

---

<p align="center">
  <a href="https://www.npmjs.com/package/ccstatusline">
    <img src="https://img.shields.io/npm/v/ccstatusline.svg" alt="npm version">
  </a>
  <a href="https://github.com/sirmalloc/ccstatusline/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
</p>