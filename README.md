# ccstatusline

A customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics in your terminal.

## Features

- 📊 **Real-time metrics** - Display model name, git branch, token usage, and more
- 🎨 **Fully customizable** - Choose what to display and customize colors
- 🖥️ **Interactive TUI** - Built-in configuration interface using React/Ink
- 🚀 **Cross-platform** - Works with both Bun and Node.js
- 📏 **80-character format** - Perfectly sized for Claude Code CLI integration

## Quick Start

No installation needed! Use directly with npx:

```bash
# Run the configuration TUI
npx ccstatusline
```

## Setup

### Configure ccstatusline

Run the interactive configuration tool:

```bash
npx ccstatusline
```

This launches a TUI where you can:
- Add/remove status line items
- Reorder items with arrow keys
- Customize colors for each element
- Preview your status line in real-time

Your settings are saved to `~/.config/ccstatusline/settings.json`.

## Usage

Once configured, ccstatusline automatically formats your Claude Code status line. The status line appears at the bottom of your terminal during Claude Code sessions.

### Available Status Items

- **Model Name** - Shows the current Claude model (e.g., "Claude 3.5 Sonnet")
- **Git Branch** - Displays current git branch name
- **Token Usage** - Shows input/output/total tokens used
- **Time** - Current time in HH:MM:SS format
- **Custom Text** - Add your own static text
- **Separator** - Visual divider between items
- **Flex Separator** - Expands to fill available space

## Configuration File

The configuration file at `~/.config/ccstatusline/settings.json` looks like:

```json
{
  "items": [
    {
      "type": "model",
      "color": "cyan"
    },
    {
      "type": "separator",
      "text": " │ ",
      "color": "gray"
    },
    {
      "type": "git_branch",
      "color": "green"
    },
    {
      "type": "separator",
      "text": " │ ",
      "color": "gray"
    },
    {
      "type": "tokens",
      "color": "yellow"
    },
    {
      "type": "flex_separator",
      "text": "─",
      "color": "gray"
    },
    {
      "type": "time",
      "color": "blue"
    }
  ]
}
```

### Color Options

Available colors:
- `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`
- `brightBlack`, `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightMagenta`, `brightCyan`, `brightWhite`

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