# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ccstatusline is a customizable status line formatter for Claude Code CLI. It operates in two modes:
1. **Piped mode**: Reads JSON from stdin (Claude Code session data), renders formatted status line to stdout
2. **Interactive TUI mode**: React/Ink configuration UI when run without piped input (TTY detected)

Fork of [sirmalloc/ccstatusline](https://github.com/sirmalloc/ccstatusline). Published to npm as `ccstatusline` (v2.2.7).

## Development Commands

```bash
bun install                    # Install dependencies
bun run start                  # Interactive TUI mode
bun run example                # Pipe example payload through renderer
bun test                       # Run all tests (Vitest)
bun test --watch               # Watch mode
bun test src/utils/__tests__/git.test.ts  # Single test file
bun run lint                   # TypeScript type check + ESLint (no modifications)
bun run lint:fix               # Apply ESLint auto-fixes
bun run build                  # Bundle to dist/ccstatusline.js (Node 14+)
```

Test with piped input (use `[1m]` suffix for 1M context models):
```bash
echo '{"model":{"id":"claude-sonnet-4-5-20250929[1m]"},"transcript_path":"test.jsonl"}' | bun run src/ccstatusline.ts
```

## Architecture

### Data Flow (Piped Mode)

```
stdin JSON → StatusJSONSchema.safeParse() → RenderContext enrichment → Widget rendering → ANSI stdout
```

1. **Input**: `StatusJSON` (Zod-validated) — model info, transcript path, context window, cost, vim mode, rate_limits
2. **Enrichment**: Supplementary data fetched in parallel — token metrics from transcript JSONL, usage API quotas, session duration, speed metrics, skills tracking
3. **RenderContext**: Combined data object passed to all widgets — contains `data` (original JSON), `tokenMetrics`, `speedMetrics`, `usageData`, `sessionDuration`, `blockMetrics`, `skillsMetrics`, `terminalWidth`
4. **Rendering**: Pre-render all widgets once for width calculation, then assemble up to 3 lines with separators/powerline styling, truncate to terminal width

### Entry Point

**src/ccstatusline.ts** — Checks `process.stdin.isTTY` to choose piped vs TUI mode. Cross-platform stdin reading (Bun vs Node.js). Windows UTF-8 code page setup. `--config` flag for custom settings path, `--hook` mode for Claude Code hook integration.

### Widget System

Widgets implement the `Widget` interface (src/types/Widget.ts): `render(item, context, settings)` returns a string or null. Stateless — all state comes from config and render context.

**Registry**: `src/utils/widget-manifest.ts` — Map-based registry mapping type strings to widget instances. `src/utils/widgets.ts` provides lookup, catalog, and search.

**Widget categories**: Core metadata (model, version), Git (branch, changes, insertions, deletions, root-dir, worktree), Tokens (input, output, cached, total), Context (length, percentage, bar), Speed (input, output, total with configurable windows), Session (clock, cost, block-timer, reset-timer, weekly timers, usage), Environment (cwd, terminal-width, free-memory, vim-mode), Integration (session-id, session-name, skills, thinking-effort), User-defined (custom-text, custom-command, link), Layout (separator, flex-separator).

**Widget config** (`WidgetItem`): Each widget instance has `id`, `type`, `color`, `backgroundColor`, `bold`, `rawValue`, `maxWidth`, `merge`, `metadata` (widget-specific flags like `hideNoGit`, `showRemaining`, speed window config).

### Settings

Stored at `~/.config/ccstatusline/settings.json`. Schema version 3 with automatic migrations from v1/v2.

Key settings: `lines` (up to 3 arrays of WidgetItem), `flexMode` (full/full-minus-40/full-until-compact), `colorLevel` (0-3), `powerline` config (separators, themes, caps), global overrides (colors, bold).

### Rendering Pipeline (src/utils/renderer.ts)

- Terminal width detection with three flex modes
- Pre-rendering optimization: all widgets rendered once, reused across lines
- Standard mode: separator chars between widgets with padding
- Powerline mode: Unicode arrow/block characters, background color cycling, start/end caps
- ANSI stripping for width calculation, non-breaking space replacement (prevents VSCode trimming)

### Key Utilities

- **jsonl.ts / jsonl-metrics.ts / jsonl-blocks.ts**: Parse Claude Code transcript JSONL for token counts, speed, block usage. Results cached with hashed filenames
- **usage-fetch.ts / usage-prefetch.ts**: Anthropic usage API client with 180s caching, proxy support (`HTTPS_PROXY`), macOS keychain auth lookup. Only fetches if widgets need it
- **git.ts**: Cached git command execution (branch, status, remote URL, worktree detection)
- **hyperlink.ts**: OSC8 terminal hyperlink support for GitBranch and GitRootDir widgets
- **model-context.ts**: Model ID → context window size mapping. `[1m]` suffix = 1M tokens, otherwise 200k
- **claude-settings.ts**: Read/write Claude Code's settings.json, detect installation, respects `CLAUDE_CONFIG_DIR`
- **config.ts / migrations.ts**: Settings load/save with version migration and backup on corruption

### TUI (src/tui/)

React 19 + Ink 6.2.0 interactive configuration. Screens: MainMenu, LineSelector, ItemsEditor (add/remove/reorder widgets), ColorMenu, GlobalOverridesMenu, PowerlineSetup, TerminalOptionsMenu, InstallMenu. Live preview updates as user configures.

## Important Notes

- **Bun-first**: Use `bun` for all commands. Bun auto-loads .env. Don't use `node`, `npm`, `ts-node`, or call ESLint/tsc directly — always go through `bun run lint` / `bun run lint:fix`
- **ink@6.2.0 patch**: Fixes backspace key handling on macOS (`\x7f` mapped to backspace instead of delete). Applied via `patchedDependencies` in package.json
- **Build**: Two-step — `bun build` bundles to dist/, then `postbuild` replaces `__PACKAGE_VERSION__` placeholder with actual version
- **Lint rules**: Never disable a lint rule via comment. ESLint flat config (eslint.config.js) with TypeScript strict checking, React plugins, import ordering (alphabetic, grouped), single quotes, 4-space indent
- **Testing**: Vitest via Bun. 33+ test files in src/utils/__tests__/ and src/widgets/__tests__/
