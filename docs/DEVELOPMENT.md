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

# Run in TUI mode with in-place reload: ctrl+r restarts on the latest code,
# keeping unsaved settings, the current screen and cursor. --config is
# optional and keeps a scratch setup separate from your real config.
CCSTATUSLINE_DEV_RELOAD=1 bun run start --config /tmp/ccstatusline-dev.json

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
- `~/.cache/ccstatusline/usage-credentials.lock` - 30-second backoff after a usage credential lookup finds no OAuth login, tagged with the profile it applies to
- `~/.cache/ccstatusline/claude-status.json` and `~/.cache/ccstatusline/claude-status.lock` - Claude service-status cache and failed-fetch backoff lock
- `~/.cache/ccstatusline/skills/skills-<sessionId>.jsonl` - skill hook records; session IDs must contain only ASCII letters, digits, `-`, or `_`

If you use a custom Claude config location, set `CLAUDE_CONFIG_DIR` and ccstatusline will read/write that path instead of `~/.claude`.

On macOS, usage credentials for a custom profile come from `Claude Code-credentials-<sha256(configDir)[:8]>`, then that profile's `.credentials.json`; the lookup does not fall back to another profile's Keychain entry. The hash uses the raw `CLAUDE_CONFIG_DIR` value normalized to NFC, without path resolution. `CLAUDE_SECURESTORAGE_CONFIG_DIR` overrides that hash input, including an empty value to force the default service lookup. Default lookup tries the plain service, discovered suffixed services, then the credentials file. Other platforms use the credentials file directly. Each Keychain subprocess has a five-second timeout; a missing OAuth login triggers a profile-specific 30-second lookup backoff.

Usage-cache identity prefers a truncated SHA-256 fingerprint of the refresh token and falls back to the access token when no refresh token is available. Access-token rotation preserves the cache when the refresh token is unchanged. Legacy caches carrying the current access-token hash remain readable; the next successful fetch stores the preferred fingerprint. Mismatched account fingerprints are rejected even for stale-cache fallback during API backoff.

Settings saves are atomic and preserve symlinked `settings.json` files by writing through the resolved target. Invalid or unreadable settings are never overwritten during load; `loadSettings()` returns in-memory defaults, records `getConfigLoadError()`, and renderer paths surface that state with an invalid-config warning badge. The TUI captures that load error, keeps a visible warning active, and guards both save paths with an overwrite confirmation until a valid configuration is saved.

The atomic temporary file uses the replaced target's permission bits, or `0666` for a new file, subject to umask. Claude settings backups are recreated with the source mode so an older, more permissive backup does not retain its permissions. Installation reads and parses existing Claude settings before backing them up or modifying them; a read or parse failure stops installation.

Configuration exports snapshot the live TUI settings and add an `exportedBy` package version. Imports reject newer schema versions before current-schema parsing, migrate supported older formats, and retain the source payload's present-key set so merge mode changes only explicitly supplied settings. `applyImport()` filters machine-local installation, schema-version, and update-message metadata; replace mode restores the current installation metadata, while merge mode preserves every omitted value.

`ImportPreviewDialog` compares the selected mode's effective Custom Command strings with the current settings, lists new commands without duplicates, and requires confirmation with Cancel selected by default before applying them. Imports without new commands keep the direct apply flow. Preview paths, values, and commands escape C0/C1 controls as visible `\uXXXX` text.

Usage-fetch tests spawn subprocess probes. Keep those probes sandboxed by setting `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, and proxy variables explicitly so tests cannot read or write a developer's live ccstatusline usage cache.

Usage-lock deadlines more than 24 hours ahead are treated as poisoned and ignored, so mocked clocks, system clock jumps, or old test artifacts cannot suppress usage fetching indefinitely. Valid deadlines up to 24 hours ahead, including API `Retry-After` backoffs, remain active. Likewise, a `usage.json` modified more than its 180-second lifetime in the future counts as stale rather than fresh.

After a complete successful usage fetch, the process clears the lock only if its contents still match the in-flight record it wrote, preserving a concurrent render's newer rate-limit backoff.

## Widget Data Sources

- **Transcript-backed widgets** stream the active JSONL transcript once per render through `getTranscriptAnalysis()`, collecting token, duration, speed, compaction, thinking-effort, and session-name data in one pass without materializing the whole file. Referenced subagent transcripts are streamed separately only when speed metrics include subagents.
- **Block Timer** caches a detected block until its five-hour window expires. When a full scan finds no active block, that empty result is cached for one minute so subsequent repaints do not repeatedly walk and read the entire transcript history.
- **Cache Timer** reads the transcript tail directly on every render. It expands the read backward when a trailing JSONL record exceeds the initial window, ignores sidechain and synthetic API-error rows, and anchors the countdown only on assistant requests with cache activity. Interrupt markers and local slash-command records end the working state without refreshing the anchor. It does not create a separate cache file.
- **Claude Status** reads `status.claude.com` through HTTPS, honors `HTTPS_PROXY` unless `NO_PROXY` excludes the host, and caches successful responses for five minutes. It requests incident data only when at least one configured Claude Status widget enables history, applies a 30-second backoff after failed fetches, and serves a usable stale cache when available.
- **Local Git widgets** cache command results in memory and under `~/.cache/ccstatusline/git-cache`, with one persistent file per repository/working-directory pair. A conservative filesystem check skips Git when the directory is definitely outside a repository, while explicit Git environment overrides still allow invocation. Cache misses invoke Git with a five-second timeout; failures, including timeouts, are cached as `null`. Persistent writes use one stable `.tmp` path per cache file and attempt best-effort cleanup on failure, bounding orphaned files when Windows virus scanners or sync clients temporarily hold a handle.
- **JJ widgets** invoke `runJjArgs()` with a five-second timeout and use their normal missing-data behavior when the command fails or times out.
- **Git PR and Git CI Status** render from the versioned disk cache under `~/.cache/ccstatusline/git-review`. Missing or stale entries are refreshed in a detached helper so network-bound `gh` or `glab` calls do not block rendering. Git CI Status adds GitHub's `statusCheckRollup`; if the authenticated `gh` token cannot read checks, the refresh retries with PR metadata only so Git PR still works.
- **Usage widgets** merge Claude Code's stdin `rate_limits` with `/api/oauth/usage` only for fields required by the active widgets. Session and aggregate weekly fields prefer the flat API buckets and fall back to `limits[]`; per-model weekly fields prefer `weekly_scoped` entries. A model-scoped entry reporting 0% without `resets_at` is valid zero usage, while unscoped empty placeholders remain filtered out. `WEEKLY_MODEL_USAGE_BUCKETS` in `src/utils/usage-types.ts` is the shared registry for Sonnet, Opus, and Fable widget wiring, field requirements, reset fields, and scoped-limit matching. Session and weekly percentage widgets delegate rendering and editor behavior to `src/widgets/shared/usage-percent-widget.ts`; the Fable label is `Weekly Fable:`.
- **Custom Command** delegates to `src/utils/custom-command.ts`. `customCommandCacheTtlSeconds` defaults to `0` (disabled), with a maximum of 60 seconds. Both successes and failures are cached, with TTL measured from command completion; without a session ID, entries stay in process memory. Other stdin fields are deliberately excluded from the key. A helper in the current runtime captures stdout in memory, limits it to 1 MiB, and retains at most 16,384 characters; it enforces command deadlines and closes inherited pipes, terminating the process group on POSIX or the shell on Windows when a command times out. Cached raw output is formatted separately by each widget, and previews never execute commands.
- **Terminal width** is memoized once per render, including a `null` probe result. Linux first probes ancestor terminal devices through `/proc` and `tty.WriteStream`; portable fallbacks use `execFileSync` for `ps` and `stty`. `CCSTATUSLINE_WIDTH` takes precedence, including on Windows where probing is disabled. Only no-width results are persisted per session, for `terminalWidthCacheTtlSeconds` (default 5, range 0–300); `0` disables cross-process reuse. Numeric widths are re-probed on the next render.
- **Context length transcript fallback** treats the latest `compact_boundary` as the start of the current context. It uses the first main-chain usage entry after that boundary, then `compactMetadata.postTokens`, then zero, while session token totals remain cumulative.
- **Sandbox Status** reads `sandbox.enabled` from Claude Code's layered project-local, project, user-local, and user settings on every refresh. This reflects `/sandbox` file updates but remains a best-effort indicator when managed or CLI settings take precedence.
- **Skills** reads only logs for session IDs accepted by `getSkillsFilePath()`. Rejected IDs return no metrics, and the hook handler exits before creating directories or writing a log.

Both usage and service-status requests honor uppercase `HTTPS_PROXY` and share `isExcludedFromProxy()` for the `NO_PROXY`/`no_proxy` rules described in [Usage](USAGE.md#proxy-settings). Each request has a total five-second deadline in addition to its socket timeout. On expiry, `createProxyAgent().close()` aborts the pending proxy connection when `AbortController` is available; on older runtimes without it, that connection can remain open. The proxy integration tests require permission to listen on a local socket.

## Widget Implementation

Shared implementations under `src/widgets/shared/` cover Git counts, status indicators and remotes, JJ widgets, token counts, extra-usage amounts, and usage percentages. Reuse the matching base class or helper when adding related widgets. `format-options.ts` shares display-format and Nerd Font controls, while `searchable-option-editor.tsx` serves the locale and timezone editors.

A widget opts into label editing with `getLabelPrefix(item)` and renders through `formatRawOrLabeledValue()`. The common `e` action stores a verbatim override in `metadata.label`; an empty string suppresses the label, raw mode bypasses it, and resetting removes the override. Keep mode-dependent default labels in `getLabelPrefix()` so previews and rendered output agree.

Session Cost Rate reads `cost.total_cost_usd` and either `cost.total_api_duration_ms` (default) or `cost.total_duration_ms` from stdin; it requires at least 60,000 ms of the selected duration. Extra Usage Daily Budget uses the usage API's limit, spend, and currency fields, with UTC day counting in `shared/daily-budget.ts`; the current day always counts, even in weekdays-only mode.

## Git Commands and Terminal Output

`execGit()` in `src/utils/git.ts` disables fsmonitor and sets `safe.bareRepository=explicit` (honored by Git 2.38+). Status/diff calls suppress repository-defined filters, external diff/textconv commands, and dirty-submodule inspection. Standard Git LFS filters and recognized absolute git-crypt commands outside the worktree remain allowed, as do filters defined in user/system config. If repository filters cannot be inspected or overridden, the command fails through the normal widget fallback. Git invoked by PR/CI helpers receives the fsmonitor and bare-repository settings through the environment.

PR/MR lookups pass explicit branch names after `--` to `gh` and `glab`, and SSH alias resolution passes the host after `ssh -G --`. Git directory-file and remote-URL parsing avoid regex backtracking on long whitespace or slash sequences.

On Windows, `resolveExecutable()` selects Git, JJ, SSH, `gh`, `glab`, and `chcp.com` from absolute PATH entries, skipping empty and relative entries. This keeps the current project directory out of implicit executable lookup.

`sanitizeTerminalText()` filters widget text before layout and piped output before printing. It retains SGR styling, OSC 8 links with control-free, space-free URLs, tabs, and newlines; other terminal controls are removed. Hyperlink construction also validates URLs. Custom Command's preserve-colors option does not bypass this filtering.

Width measurement fast-paths printable ASCII and caches up to 4,096 display-cluster widths per process. Truncation measures clusters across intervening ANSI escapes, preserving styling and hyperlink boundaries without exceeding the requested width.

Widget hook synchronization installs ccstatusline hooks only when the configured status line command contains `ccstatusline`; otherwise it removes ccstatusline's managed hooks and preserves unrelated hooks.

Update checks and global package installs both validate release-version strings before constructing install commands, including npm's Windows shell invocation. Powerline font installation uses a fresh `mkdtempSync()` directory and `execFileSync()` for Git and the downloaded installer, with cleanup in `finally`.

## Build Notes

- The entry point imports the TUI lazily for interactive mode; keep the Ink initialization path out of piped rendering. The distribution build uses code splitting, so ship the complete `dist/` directory.
- Build target is Node.js 14+ (`dist/ccstatusline.js`)
- `postbuild` replaces the bundled `__PACKAGE_VERSION__` placeholder from `package.json`; `ccstatusline --version` reads that value and exits before mode detection
- During install, `ink@6.2.0` is patched to fix backspace handling on macOS terminals
- React and React DOM are exact-version pins; dependency refreshes should update `package.json` and `bun.lock` together

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
