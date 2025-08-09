# ccstatusline

A customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics in your terminal.

## Features

- 📊 **Real-time metrics** - Display model name, git branch, token usage, session duration, and more
- 🎨 **Fully customizable** - Choose what to display and customize colors
- 📐 **Multi-line support** - Configure up to 3 status lines
- 🖥️ **Interactive TUI** - Built-in configuration interface using React/Ink
- 🚀 **Cross-platform** - Works with both Bun and Node.js
- 📏 **Auto-width detection** - Automatically adapts to terminal width with flex separators

## Quick Start

No installation needed! Use directly with npx:

```bash
# Run the configuration TUI
npx ccstatusline@latest
```

## Setup

### Configure ccstatusline

Run the interactive configuration tool:

```bash
npx ccstatusline@latest
```

This launches a TUI where you can:
- Configure up to 3 separate status lines
- Add/remove/reorder status line items
- Customize colors for each element
- Configure flex separator behavior
- Edit custom text items
- Install/uninstall to Claude Code settings
- Preview your status line in real-time

Your settings are saved to `~/.config/ccstatusline/settings.json`.

## Usage

Once configured, ccstatusline automatically formats your Claude Code status line. The status line appears at the bottom of your terminal during Claude Code sessions.

### Available Status Items

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
- **Separator** - Visual divider between items (customizable: |, -, comma, space)
- **Flex Separator** - Expands to fill available space

### TUI Controls

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
- **e** - Edit custom text (for custom-text items)
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

### Raw Value Mode

Some items support "raw value" mode which displays just the value without a label:
- Normal: `Model: Claude 3.5 Sonnet` → Raw: `Claude 3.5 Sonnet`
- Normal: `Session: 2hr 15m` → Raw: `2hr 15m`
- Normal: `Ctx: 18.6k` → Raw: `18.6k`

### Status Line Truncation

When terminal width is detected, status lines automatically truncate with ellipsis (...) if they exceed the available width, preventing line wrapping.

## Development

### Prerequisites

- [Bun](https://bun.sh)
- Git

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

### Project Structure

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
## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Author

Matthew Breedlove

## Acknowledgments

Built for use with [Claude Code CLI](https://claude.ai/code) by Anthropic.