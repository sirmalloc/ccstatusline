# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ccstatusline is a customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics. It functions as both:
1. A piped command processor for Claude Code status lines
2. An interactive TUI configuration tool when run without input

## Development Commands

```bash
# Install dependencies
bun install

# Run with patch (TUI mode)
bun run start

# Run directly (TUI mode)
bun run statusline

# Test with piped input
echo '{"model":{"display_name":"Claude 3.5 Sonnet"},"transcript_path":"test.jsonl"}' | bun run src/ccstatusline.ts

# Build for npm distribution
bun run build   # Creates dist/ccstatusline.js with Node.js 14+ compatibility

# Lint and type check
bun run lint   # Runs TypeScript type checking and ESLint with auto-fix

# Run specific components during development
bun run patch  # Apply patches (required before development)
```

## Architecture

The project has dual runtime compatibility - works with both Bun and Node.js:

### Core Structure
- **src/ccstatusline.ts**: Main entry point that detects piped vs interactive mode
  - Piped mode: Parses JSON from stdin and renders formatted status line
  - Interactive mode: Launches React/Ink TUI for configuration

### TUI Components (src/tui/)
- **index.tsx**: Main TUI entry point that handles React/Ink initialization
- **App.tsx**: Root component managing navigation and state
- **components/**: Modular UI components for different configuration screens
  - MainMenu, LineSelector, ItemsEditor, ColorMenu, GlobalOverridesMenu
  - PowerlineSetup, TerminalOptionsMenu, StatusLinePreview

### Utilities (src/utils/)
- **config.ts**: Settings management
  - Loads from `~/.config/ccstatusline/settings.json`
  - Handles migration from old settings format
  - Default configuration if no settings exist
- **renderer.ts**: Core rendering logic for status lines
  - Handles terminal width detection and truncation
  - Applies colors, padding, and separators
  - Manages flex separator expansion
  - Supports both normal and Powerline rendering modes
- **powerline.ts**: Powerline font detection and installation
- **claude-settings.ts**: Integration with Claude Code settings.json
- **colors.ts**: Color definitions and ANSI code mapping
- **widgets.ts**: Widget registry and factory functions
- **terminal.ts**: Terminal width detection utilities
- **jsonl.ts**: JSONL parsing for token metrics and session data

### Widgets (src/widgets/)
- Individual widget implementations for status line items
- Each widget exports render() and getDefaultColor() functions
- Includes built-in widgets: Model, GitBranch, TokensTotal, OutputStyle, BlockTimer, etc.
- Custom widgets: CustomText and CustomCommand for user-defined content

## Key Implementation Details

- **Dual runtime support**: Detects Bun vs Node.js environment and uses appropriate stdin API
- **Token metrics**: Parses Claude Code transcript files (JSONL format) to calculate token usage
- **Git integration**: Uses child_process.execSync to get current branch and changes
- **Terminal width management**: Three modes for handling width (full, full-minus-40, full-until-compact)
- **Flex separators**: Special separator type that expands to fill available space
- **Powerline mode**: Optional Powerline-style rendering with arrow separators and theme support
- **Custom commands**: Execute shell commands and display output in status line
- **Mergeable items**: Items can be merged together with or without padding
- **Widget registry**: Factory pattern for widget creation and type safety

## Bun Usage Preferences

Default to using Bun instead of Node.js:
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bun build` with appropriate options for building
- Bun automatically loads .env, so don't use dotenv

## Important Notes

- **patch-package**: The project uses patch-package to fix ink-gradient compatibility. Always run `bun run patch` before starting development
- **ESLint configuration**: Uses flat config format (eslint.config.js) with TypeScript and React plugins
- **Build target**: When building for distribution, target Node.js 14+ for maximum compatibility
- **Dependencies**: All runtime dependencies are bundled using `--packages=external` for npm package
- **Type checking and linting**: Only run via `bun run lint` command, never using `npx eslint` or `eslint` directly. Never run `tsx`, `bun tsc` or any other variation
- **Lint rules**: Never disable a lint rule via a comment, no matter how benign the lint warning or error may seem
- **Testing**: No test framework is currently configured. Manual testing is done via piped input and TUI interaction