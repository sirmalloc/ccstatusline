# Development

Development setup, project structure, and API documentation for `ccstatusline`.

If you want the main project overview, return to [README.md](../README.md).

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git
- Node.js 14+ (optional, for running the built `dist/ccstatusline.js` binary or npm publishing)

## Setup

```bash
# Clone the repository
git clone https://github.com/sirmalloc/ccstatusline.git
cd ccstatusline

# Install dependencies
bun install
```

## Development Commands

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

## Configuration Files

- `~/.config/ccstatusline/settings.json` - ccstatusline UI/render settings
- `~/.claude/settings.json` - Claude Code settings (`statusLine` command object)
- `~/.cache/ccstatusline/block-cache-*.json` - block timer cache (keyed by Claude config directory hash)
- `~/.cache/ccstatusline/git-cache/git-*.json` - persistent git widget command cache
- `~/.cache/ccstatusline/git-review/git-review-*.json` - cached Git PR/MR lookup results
- `~/.cache/ccstatusline/usage.json` and `~/.cache/ccstatusline/usage.lock` - usage API data cache and fetch backoff lock

If you use a custom Claude config location, set `CLAUDE_CONFIG_DIR` and ccstatusline will read/write that path instead of `~/.claude`.

Settings saves are atomic and preserve symlinked `settings.json` files by writing through the resolved target. Invalid or unreadable settings are never overwritten during load; `loadSettings()` returns in-memory defaults, records `getConfigLoadError()`, and renderer paths surface that state with an invalid-config warning badge.

Usage-fetch tests spawn subprocess probes. Keep those probes sandboxed by setting `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, and proxy variables explicitly so tests cannot read or write a developer's live ccstatusline usage cache.

## Build Notes

- Build target is Node.js 14+ (`dist/ccstatusline.js`)
- During install, `ink@6.2.0` is patched to fix backspace handling on macOS terminals
- React and React DOM are exact-version pins; dependency refreshes should update `package.json` and `bun.lock` together

## API Documentation

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

The documentation will be generated in the `typedoc/` directory and can be viewed by opening `typedoc/index.html` in your web browser.

### Documentation Structure

- **Types**: Core TypeScript interfaces and type definitions
- **Widgets**: Individual widget implementations and their APIs
- **Utils**: Utility functions for configuration, rendering, and terminal operations
- **Main Module**: Primary entry point and orchestration functions

## Project Structure

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
├── docs/                       # Hand-written repository docs
├── typedoc/                    # Generated API docs
├── package.json
├── tsconfig.json
└── README.md
```
