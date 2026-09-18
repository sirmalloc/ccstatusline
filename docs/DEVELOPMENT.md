# Development

Development setup, project structure, and API documentation for `ccstatusline`.

If you want the main project overview, return to [README.md](../README.md).

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git
- Node.js 22.0.0+ (optional, for running the built `dist/ccstatusline.js` binary; publishing CI uses Node.js 24)

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
- `~/.cache/ccstatusline/block-cache-*.json` - block timer cache, including one-minute no-active-block results (keyed by Claude config directory hash)
- `~/.cache/ccstatusline/git-cache/git-*.json` - persistent git widget command cache
- `~/.cache/ccstatusline/git-review/git-review-*.json` - cached Git PR/MR lookup results
- `~/.cache/ccstatusline/custom-command-cache/cmd-*.json` - opt-in custom command results, grouped by working directory and keyed by command, timeout, session ID, and terminal width
- `~/.cache/ccstatusline/terminal-width.json` - per-session no-width probe results; detected numeric widths are not persisted by the renderer
- `~/.cache/ccstatusline/usage.json` and `~/.cache/ccstatusline/usage.lock` - usage API data cache and fetch backoff lock
- `~/.cache/ccstatusline/claude-status.json` and `~/.cache/ccstatusline/claude-status.lock` - Claude service-status cache and failed-fetch backoff lock

If you use a custom Claude config location, set `CLAUDE_CONFIG_DIR` and ccstatusline will read/write that path instead of `~/.claude`.

On macOS, usage credentials for a custom profile come from `Claude Code-credentials-<sha256(configDir)[:8]>`, then that profile's `.credentials.json`; the lookup does not fall back to another profile's Keychain entry. The hash uses the raw `CLAUDE_CONFIG_DIR` value normalized to NFC, without path resolution. `CLAUDE_SECURESTORAGE_CONFIG_DIR` overrides that hash input, including an empty value to force the default service lookup. Default lookup tries the plain service, discovered suffixed services, then the credentials file. Other platforms use the credentials file directly.

Usage-cache identity prefers a truncated SHA-256 fingerprint of the refresh token and falls back to the access token when no refresh token is available. Access-token rotation preserves the cache when the refresh token is unchanged. Legacy caches carrying the current access-token hash remain readable; the next successful fetch stores the preferred fingerprint. Mismatched account fingerprints are rejected even for stale-cache fallback during API backoff.

Settings saves are atomic and preserve symlinked `settings.json` files by writing through the resolved target. Invalid or unreadable settings are never overwritten during load; `loadSettings()` returns in-memory defaults, records `getConfigLoadError()`, and renderer paths surface that state with an invalid-config warning badge. The TUI captures that load error, keeps a visible warning active, and guards both save paths with an overwrite confirmation until a valid configuration is saved.

Configuration exports snapshot the live TUI settings and add an `exportedBy` package version. Imports reject newer schema versions before current-schema parsing, migrate supported older formats, and retain the source payload's present-key set so merge mode changes only explicitly supplied settings. `applyImport()` filters machine-local installation, schema-version, and update-message metadata; replace mode restores the current installation metadata, while merge mode preserves every omitted value.

Usage-fetch tests spawn subprocess probes. Keep those probes sandboxed by setting `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, and proxy variables explicitly so tests cannot read or write a developer's live ccstatusline usage cache.

Usage-lock deadlines more than 24 hours ahead are treated as poisoned and ignored, so mocked clocks, system clock jumps, or old test artifacts cannot suppress usage fetching indefinitely. Valid deadlines up to 24 hours ahead, including API `Retry-After` backoffs, remain active.

## Widget Data Sources

- **Transcript-backed widgets** stream the active JSONL transcript once per render through `getTranscriptAnalysis()`, collecting token, duration, speed, compaction, thinking-effort, and session-name data in one pass without materializing the whole file. Referenced subagent transcripts are streamed separately only when speed metrics include subagents.
- **Block Timer** caches a detected block until its five-hour window expires. When a full scan finds no active block, that empty result is cached for one minute so subsequent repaints do not repeatedly walk and read the entire transcript history.
- **Cache Timer** reads the transcript tail directly on every render. It expands the read backward when a trailing JSONL record exceeds the initial window, ignores sidechain and synthetic API-error rows, and anchors the countdown only on assistant requests with cache activity. It does not create a separate cache file.
- **Claude Status** reads `status.claude.com` through HTTPS, honors `HTTPS_PROXY`, and caches successful responses for five minutes. It requests incident data only when at least one configured Claude Status widget enables history, applies a 30-second backoff after failed fetches, and serves a usable stale cache when available.
- **Local Git widgets** cache command results in memory and under `~/.cache/ccstatusline/git-cache`. Cache misses invoke Git with a five-second timeout; failures, including timeouts, are cached as `null`. Persistent writes use one stable `.tmp` path per cache file and attempt best-effort cleanup on failure, bounding orphaned files when Windows virus scanners or sync clients temporarily hold a handle.
- **Git PR and Git CI Status** render from the versioned disk cache under `~/.cache/ccstatusline/git-review`. Missing or stale entries are refreshed in a detached helper so network-bound `gh` or `glab` calls do not block rendering. Git CI Status adds GitHub's `statusCheckRollup`; if the authenticated `gh` token cannot read checks, the refresh retries with PR metadata only so Git PR still works.
- **Usage widgets** merge Claude Code's stdin `rate_limits` with `/api/oauth/usage` only for fields required by the active widgets. Session and aggregate weekly fields prefer the flat API buckets and fall back to `limits[]`; per-model weekly fields prefer `weekly_scoped` entries. A model-scoped entry reporting 0% without `resets_at` is valid zero usage, while unscoped empty placeholders remain filtered out. `WEEKLY_MODEL_USAGE_BUCKETS` in `src/utils/usage-types.ts` is the shared registry for Sonnet, Opus, and Fable widget wiring, field requirements, reset fields, and scoped-limit matching. Session and weekly percentage widgets delegate rendering and editor behavior to `src/widgets/shared/usage-percent-widget.ts`; the Fable label is `Weekly Fable:`.
- **Custom Command** delegates to `src/utils/custom-command.ts`. `customCommandCacheTtlSeconds` defaults to `0` (disabled), with a maximum of 60 seconds. Both successes and failures are cached, with TTL measured from command completion; without a session ID, entries stay in process memory. Other stdin fields are deliberately excluded from the key. A helper in the current runtime captures stdout in memory, limits it to 1 MiB, and retains at most 16,384 characters; it enforces command deadlines and closes inherited pipes, terminating the process group on POSIX or the shell on Windows when a command times out. Cached raw output is formatted separately by each widget, and previews never execute commands.
- **Terminal width** is memoized once per render, including a `null` probe result. Linux first probes ancestor terminal devices through `/proc` and `tty.WriteStream`; portable fallbacks use `execFileSync` for `ps`, `stty`, and `tput`. `CCSTATUSLINE_WIDTH` takes precedence, including on Windows where probing is disabled. Only no-width results are persisted per session, for `terminalWidthCacheTtlSeconds` (default 5, range 0–300); `0` disables cross-process reuse. Numeric widths are re-probed on the next render.
- **Context length transcript fallback** treats the latest `compact_boundary` as the start of the current context. It uses the first main-chain usage entry after that boundary, then `compactMetadata.postTokens`, then zero, while session token totals remain cumulative.
- **Sandbox Status** reads `sandbox.enabled` from Claude Code's layered project-local, project, user-local, and user settings on every refresh. This reflects `/sandbox` file updates but remains a best-effort indicator when managed or CLI settings take precedence.

## Build Notes

- The renderer and TUI require Node.js 22.0.0+ or Bun. Node.js 14–21 only runs the upgrade launcher; it does not run the application.
- `scripts/build.ts` bundles `src/ccstatusline.ts` as `dist/ccstatusline-app.js` with ESM code splitting, then copies `scripts/launcher.js` verbatim to the public `dist/ccstatusline.js` entry point. Keep the launcher dependency-free, compatible with Node.js 14.0.0, and outside the bundler: generated helpers may use newer syntax. It checks the runtime before dynamically importing the application, and explicitly allows Bun.
- `postbuild` replaces `__PACKAGE_VERSION__` in every emitted JavaScript file, including the launcher and shared chunks. `ccstatusline --version` works without loading the application on every launcher-supported runtime.
- On older Node versions, piped calls print a clickable upgrade notice to stdout and exit successfully. Interactive calls show a plain upgrade-guide URL. Hook and internal cache-refresh calls remain silent. The fallback does not read or modify configuration files.
- During install, `ink@6.2.0` is patched to fix backspace handling on macOS terminals
- React and React DOM are exact-version pins; dependency refreshes should update `package.json` and `bun.lock` together

### Packaged runtime checks

Runtime compatibility checks are manual; they do not run on pushes or pull requests. To run them on GitHub, select **Actions → Runtime Compatibility (Manual) → Run workflow**. The workflow runs the same command as the local checks below.

The checks install the actual npm tarball into fresh, network-disabled Docker containers on Node.js 14.0.0, 14.21.3, 16, 18, 20, 21, 22.0.0, current 22, and 24. They cover version output, status-line output, and interactive startup under a real PTY. Supported runtimes also navigate the TUI, edit and save a widget, and reload that setting in the renderer. Unsupported runtimes must show the guide, preserve settings, keep hooks silent, and work even when all application chunks are removed.

After installing dependencies, run locally on macOS or Linux (or WSL) with Bun, npm, Python 3, and a running Docker daemon:

```bash
# Build, pack, and run the full matrix
bun run test:runtimes

# Build, pack, and check selected runtimes
bun run test:runtimes node:14.0.0-buster-slim node:22.0.0-bookworm-slim
```

The command rebuilds `dist/`, then keeps the tarball, isolated test settings, logs, and `results.json` summary in a temporary directory whose path it prints. Nothing is published. Pass `--output-dir <directory>` to choose where test logs and settings are stored. To test an existing tarball without rebuilding, use `python3 scripts/test-package-runtimes.py <tarball> [image ...]`.

These are packaged runtime checks; development dependencies and the Bun test runner do not need to run on old Node versions.

## API Documentation

[`llms.txt`](../llms.txt) provides a short project overview and links to the hand-written guides for coding agents.

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
