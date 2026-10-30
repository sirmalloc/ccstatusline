# Usage

Usage documentation for `ccstatusline`.

If you want the main project overview, return to [README.md](../README.md).

Once configured, `ccstatusline` automatically formats your Claude Code status line. The status line appears at the bottom of your terminal during Claude Code sessions.

## Runtime Modes

- **Interactive mode (TUI)**: Launches when there is no stdin input
- **Piped mode (renderer)**: Parses Claude Code status JSON from stdin and prints one or more formatted lines
- **Version mode**: Prints the installed ccstatusline package version and exits when passed `--version`

```bash
# Interactive TUI
bun run start

# Piped mode with example payload
bun run example

# Print the installed package version
ccstatusline --version
```

## Available Widgets

### Claude & Session

- **Model** / **Output Style** / **Version** - Show the active Claude model, output style, and Claude Code CLI version. Model names omit trailing context suffixes like `(1M context)`; use **Context Window** when you want the total window size shown.
- **Claude Session ID** / **Session Name** / **Claude Account Email** - Show session identifiers plus the currently signed-in Claude account email. Session Name uses the latest `/rename` title, falling back to the latest automatic Claude Code title when the session has not been renamed. Claude Account Email names the account the usage credentials belong to, looked up from `api.anthropic.com` once per login; see [Usage Credentials and Cache](#usage-credentials-and-cache).
- **Claude Status** - Show the current Claude/Anthropic service status from `status.claude.com` (`ok` when the indicator is `none`, otherwise the indicator word such as `minor`, `major`, `critical`, or `maintenance`). Press `h` in the editor to add a 48-hour incident-history strip of eight six-hour blocks (oldest to newest), each colored by the worst incident overlapping that block: green (none), yellow (minor), orange (major), red (critical). Responses are cached for about five minutes; on network failure the widget shows the last fetched status while it is under an hour old, and `?` otherwise. With the history strip enabled the widget colors itself by severity, so per-widget foreground colors and theme foregrounds are skipped, like Custom Command's preserve-colors mode. Press `l` to make the widget a link to the status page (`https://status.claude.com`), in terminals that support OSC 8 hyperlinks.
- **Voice Status** - Show whether Claude Code voice input is enabled. It can render as an icon, icon plus text, plain text, or `voice on/off`, with optional Nerd Font microphone icons.
- **Fast Mode** - Show whether Claude Code's fast mode is on, from the status line's `fast_mode` field. It can render as icon plus text (`⚡ on` / `⚡ off`, the default), an icon with a state dot, plain text, or `fast on/off`, with optional Nerd Font lightning icons. It can hide while fast mode is off, and shows nothing on Claude Code versions that don't report fast mode.
- **Sandbox Status** - Show the effective `sandbox.enabled` value from Claude Code's layered project and user settings. It can render as a glyph, `SB: ON/OFF`, or `Sandbox: ON/OFF`, with optional Nerd Font lock icons. The value is refreshed after `/sandbox` changes, but is best effort when managed or CLI settings override files or sandbox initialization fails.
- **Thinking Effort** / **Vim Mode** / **Skills** - Show Claude thinking effort, the current vim editing mode, and skill activity from hook data. Thinking Effort reads live status JSON first, then `/model` or `/effort` transcript output, then settings fallback; it supports `low`, `medium`, `high`, `xhigh`, and `max`, shows `default` when no effort is set, and marks unknown future values with `?`. Claude Code reports Ultracode as `xhigh` in status line data; it does not expose Ultracode as a separate effort level.
- **Session Clock** / **Session Cost** / **Session Cost Rate** - Show elapsed session time, the current session cost in USD, and that cost per hour (`Rate: $5.00/hr`). Session Cost Rate divides by the time Claude spent working (API time) by default, or by the whole session with clock time on, and shows nothing until a full minute of that time has passed.

### Git

- **Git Branch** / **Git Root Dir** / **Git PR** - Show the current branch, repository root directory, and PR/MR details for the current branch with optional links. With a detached HEAD, Git Branch shows the short commit SHA in parentheses, except in a colocated JJ repository, where it uses the no-git placeholder (or hides it with `no-git`). Press `f` to abbreviate branch names in fish style: `feature/team/topic` becomes `f/t/topic`, and a single-segment name such as `main` becomes `m`. Detached commit IDs are unchanged, and links keep the full branch target. Git Branch and Git Root Dir can cap their visible labels to a per-widget maximum width; truncation keeps OSC 8 hyperlink targets intact. Works with GitHub (`gh`) and GitLab (`glab`); SSH remote aliases are resolved with `ssh -G` before provider detection, while canonical GitHub/GitLab remotes keep their original forge hosts. For self-hosted hosts whose name contains neither token, whichever CLI is authenticated against that host (`gh auth status --hostname <h>` / `glab auth status --hostname <h>`) is used.
- **Git CI Status** - Summarize GitHub checks for the current branch's pull request as failing (`✗`), pending (`●`), and successful (`✓`) counts. Raw-value mode renders `failing`, `pending`, or `passing`; `-` means no pull request or readable check rollup. This widget is GitHub-only and uses the same cached `gh` lookup as Git PR.
- **Git Changes** / **Git Insertions** / **Git Deletions** - Show combined or separate insertion/deletion counts, with customizable signs through `g`.
- **Git Status** / **Git Staged** / **Git Unstaged** / **Git Untracked** / **Git Ahead/Behind** / **Git Conflicts** / **Git SHA** - Show compact repo-state indicators, upstream divergence, merge-conflict count, and the current short commit SHA.
- **Git Staged Files** / **Git Unstaged Files** / **Git Untracked Files** / **Git Clean Status** - Show file-level status counts and clean/dirty state. Git Clean Status supports custom clean/dirty glyphs through `g`; raw mode shows the words `clean` or `dirty`.
- **Git Origin Owner** / **Git Origin Repo** / **Git Origin Owner/Repo** - Show parsed `origin` remote metadata.
- **Git Upstream Owner** / **Git Upstream Repo** / **Git Upstream Owner/Repo** / **Git Is Fork** - Show upstream remote metadata and whether the current repo is a fork. Git Is Fork displays `⑂` for forks by default; press `g` to customize it, or use raw mode for `true`/`false`.
- **Git Worktree** / **Git Worktree Mode** / **Git Worktree Name** / **Git Worktree Branch** / **Git Worktree Original Branch** - Show worktree status plus the active worktree's name and branch metadata. Git Worktree supports `f` for fish-style abbreviation, including `main` → `m`.

### Jujutsu (JJ)

- **JJ Revision** / **JJ Bookmarks** / **JJ Workspace** - Show the current change ID, bookmarks, or workspace name, with customizable prefix glyphs through `g`.
- **JJ Changes** / **JJ Insertions** / **JJ Deletions** - Show combined or separate insertion/deletion counts, with customizable signs through `g`.
- **JJ Root Dir** / **JJ Description** - Show the repository root directory name or current change description.

### Tokens, Usage & Context

- **Tokens Input** / **Tokens Output** / **Tokens Cached** / **Tokens Total** - Show current-session token counts. Input/output prefer cumulative transcript metrics and fall back to `context_window.total_input_tokens` / `context_window.total_output_tokens` when transcript metrics are unavailable; cached/total use transcript metrics.
- **Cache Hit Rate** / **Cache Read** / **Cache Write** - Show prompt-cache efficiency. Cache Hit Rate uses cache reads divided by cache reads plus cache writes; Cache Read and Cache Write include each value's share of prompt context. They default to the latest turn from `context_window.current_usage`, can switch to cumulative session totals, and can hide when empty.
- **Cache Timer** - Show time remaining before the current prompt-cache entry expires. When Claude Code provides usable `prompt_cache` data, the widget counts down to `expires_at` or shows `COLD` when `warm` is false. The reported `ttl` (`5m` or `1h`) controls the fresh/draining/urgent glyph thresholds. This reported state takes precedence even during a turn, so the Working glyph (`🔥 HOT`) is used only in the transcript fallback. Without usable reported state (including `caching_observed: false`), the widget shows `HOT` while a main-chain turn is active, then estimates expiry from the latest assistant request with cache activity. Interrupts and local slash commands such as `/cost` end that working state without refreshing the cache anchor. The `t` setting selects a 5-minute or 1-hour TTL for this fallback countdown; it also supplies glyph thresholds when a reported expiry has no recognized TTL. Each state's glyph can be customized, and the widget can hide when neither reported state nor a transcript cache anchor is available.
- **Cache Misses** / **Last Cache Miss** / **Cache Miss Tokens** / **Cache If Cold** - Show the prompt cache statistics Claude Code reports for the main conversation (Claude Code 2.1.251 or later), the same figures as the `Prompt cache (main)` line of `/usage`. Cache Misses shows the misses out of the session's requests (`2/14`); a miss is a request that re-processed content the cache already held, so rebuilds after a compaction don't count. Last Cache Miss shows when the last miss happened and its likely cause (`3m ago, tools changed (+2)`, `5m TTL expired`, `system prompt changed (+120 chars)`); causes need Claude Code 2.1.260 or later and read `cause unknown` when Claude Code identified none. Cache Miss Tokens shows the tokens the misses wrote back to the cache (`310.2k`), and Cache If Cold what the next request re-caches if the cache has gone cold by then (`45.0k`). They read only the status line payload, so they render nothing until the session's first API response; Last Cache Miss also stays empty until the first miss, and Cache If Cold right after a compaction until the next request.
- **Input Speed** / **Output Speed** / **Total Speed** - Show session-average token throughput with an optional per-widget rolling window (`0-3600` seconds, up to an hour; `0` = full-session average). Token totals and speed metrics count repeated content-block records with the same response ID once, including interleaved records.
- **Context Length** / **Context Window** / **Context %** / **Context % (usable)** / **Context Bar** - Show current context length, total context window size, used/remaining percentage, usable-window percentage, or a progress bar. When Claude Code omits a percentage, the percentage calculated from its current usage counts input, cache-read, and cache-write tokens, excluding output tokens until a later turn reads them as input. Reported percentages retain precedence. The window size is taken from Claude Code's reported `context_window.context_window_size` when present, then from a model-name hint (e.g. a `[1m]` suffix), and finally from a fixed fallback. Set `CCSTATUSLINE_CONTEXT_SIZE_FALLBACK` to a positive integer to override that last-resort fallback (defaults to `200000`) — useful when an older Claude Code does not report the window size for a 1M-context model, so the bar would otherwise read against 200k. Immediately after `/compact`, transcript fallback uses the latest `compact_boundary.postTokens` value until a new main-chain turn reports the current size, so the widgets do not retain the pre-compaction context.
- **Compaction Counter** - Show how many context compactions have been detected in the current session by scanning transcript compaction markers. It can render as icon plus number, text plus number, or number-only, and can hide while the count is zero. Two optional, independent per-item add-ons toggle extra detail: a trigger split (`↻ 3 (2 auto, 1 manual)`; a compaction whose trigger is missing or unrecognized is bucketed as `unknown`) and tokens reclaimed (`↻ 3 ↓887.0k`, each compaction's `preTokens - postTokens` floored at 0 and summed, shown only when greater than 0 — so very old transcripts predating the `postTokens` field display nothing). Its value selector can instead render the total count, one trigger count (`auto`, `manual`, or `unknown`), or reclaimed tokens as a standalone value; hide-when-zero applies to the selected value.
- **Spend Limit Usage** / **Spend Limit Amount** - For developers behind a Claude apps gateway with spend limits (Claude Code 2.1.251 or later). Spend Limit Usage shows the share of the limit used, as a percentage or bar, and can show the remaining share instead. Spend Limit Amount shows `$314.12 / $500.00` and renders nothing until the gateway reports the dollar figures (Claude Code and gateway 2.1.284 or later). Both read `rate_limits.spend_limit` from the status line payload only and never call the usage API; without a spend limit they render nothing.
- **Block Usage** / **Weekly Usage** / **Weekly Sonnet Usage** / **Weekly Opus Usage** / **Weekly Fable Usage** / **Extra Usage Utilization** / **Extra Usage Remaining** / **Extra Usage Used** / **Extra Usage Limit** / **Extra Usage Daily Budget** / **Block Timer** / **Block Reset Timer** / **Weekly Reset Timer** - Show usage percentages, monthly pay-as-you-go overage usage, and current block/reset timing. Block Usage and the all-model Weekly Usage read the legacy flat API buckets when available and fall back per field to `session` and `weekly_all` entries in the newer `limits[]` response. The per-model widgets prefer `weekly_scoped` entries for Sonnet, Opus, and Fable, with legacy Sonnet/Opus buckets as fallbacks; Weekly Fable Usage renders nothing when the API reports no Fable quota. Block Usage, the weekly percentage widgets, and Extra Usage Utilization can show either used or remaining percentage in every display mode. Block and weekly usage bars can also show a time cursor: elapsed time in used mode, or time remaining in remaining mode. Extra usage widgets accept known extra-usage state as complete when an account has no monthly limit configured, avoid repeated refetches and stale `[Timeout]` output, and format amounts with the API-reported billing currency when available. On accounts with no plan limits (usage-based Enterprise plans), extra usage is all of the account's spend rather than overage beyond a plan; the label editor can change the Extra Usage widgets' `Overage` labels to read `Spend`. Extra Usage Limit shows the monthly limit itself, or `none` when extra usage is on without a monthly limit. Before the first charge of the month the API reports no utilization, so Extra Usage Utilization works it out from the amount spent and the monthly limit. Extra Usage Daily Budget divides what's left of the monthly limit by the days left in the month, today included, optionally skipping future weekend days (today always counts). It requires a monthly limit and amount spent, and displays zero once the limit is exhausted. Days are UTC days, since monthly limits reset at 00:00 UTC on the 1st. Reset timers can show remaining time, progress, or exact reset date/time with timezone and locale controls; while reset data is still arriving at startup, they show a labeled loading placeholder instead of a transient API error.
- **Block Forecast** / **Block Limit Timer** - Forecast the 5-hour block from the recent pace. Block Forecast shows the projected usage at reset (`→83.2%`), and Block Limit Timer shows how long until 100% (`Limit in: 1hr 13m`) when that comes before the reset. Both go away once the block reaches 100%, by the session's percent or, with Block Usage's `at-limit` or Block Reset Timer's `under-limit` hide state on, by those states' check (the usage API's percent), whichever gets there first. So they never sit next to the reset countdown. Each renders nothing until it has something to show, so they sit naturally right after the 5-hour usage widget. The pace is measured over the last 30 minutes from readings saved in `~/.cache/ccstatusline/session-usage-history.json`, kept separately for each Claude config directory and each login within it. A stretch with no status-line updates (the machine asleep, or usage on another device) is spread evenly across the gap, and a new block can be forecast once it is 10 minutes old.
- **Weekly Limit Timer** / **Weekly Fable Limit Timer** - Show how long until the all-models or the Fable-only 7-day limit at this week's average pace (`Weekly limit in: 1d 22hr 40m`, `Fable limit in: 2d 4hr`), when that comes before the window's reset. The pace is the window's percent over the time since it started, which is its reset time minus 7 days, so nights and days off count toward it. Each renders nothing during the window's first day, when the pace reaches the limit only after the reset, and at 100%, where Weekly Reset Timer takes over. They read the same percent and reset time as Weekly Usage and Weekly Fable Usage (Fable's window uses the all-models reset when the API sends none of its own), and save no history.

Block Usage was previously named Session Usage. Its default label is now `5h:`, while the saved widget type remains `session-usage` and custom labels are preserved.

An explicit per-model quota at 0% is shown even when its reset timestamp is still missing; the time cursor appears only once a usable window is available. Weekly Fable Usage uses the label `Weekly Fable:` and stays empty when the API reports no Fable quota.

### Environment, Layout & Custom

- **Current Working Dir** / **Terminal Width** / **Memory Usage** - Show the current working directory, detected terminal width, and system memory usage. Current Working Dir can prepend an optional custom glyph, including when raw-value mode replaces the `cwd:` label. When combining home abbreviation with a segment limit, `~` is preserved without counting toward that limit. Press `l` in its editor to cycle clickable links (`off` → file manager → VS Code → Cursor). The displayed path still honors home abbreviation, segment limits, and fish-style shortening, while the link always targets the original absolute directory. File-manager links use `file://` URLs on POSIX and Windows, including UNC shares; local terminals need OSC 8 hyperlink support.
- **Custom Text** / **Custom Symbol** / **Custom Command** / **Link** - Add user-defined text, a single symbol or emoji, custom command output, or a clickable OSC 8 hyperlink.
- **Separator** / **Flex Separator** - Add a manual divider or a width-filling flexible spacer. Manual separators stay saved but are hidden in Powerline mode, reappearing when it is disabled; flex separators still work there as layout spacers.

## Terminal Width

Status lines use the full terminal width minus 5 columns of padding: longer lines are truncated there, and flex separators right-align against it. Outside fullscreen rendering, Claude Code shows notifications such as the context-low warning on the same row, and on narrow terminals they may cut the status line short.

Settings files from earlier versions may still carry `flexMode` and `compactThreshold`, from the removed **Full width minus 40** and **Full width until compact** modes. They are ignored, and the next save from the TUI removes them.

Flex separators expand against the detected width in both regular and Powerline rendering. If width detection is unavailable, they render like normal separators until a terminal width is available.

If ccstatusline cannot detect your terminal width, set `CCSTATUSLINE_WIDTH` to a positive integer to override probing:

```bash
CCSTATUSLINE_WIDTH=160 ccstatusline
```

The override is checked before automatic width detection, so it also works in wrapper processes, IDE integrations, nested PTYs, and Windows environments where probing may be unavailable. Invalid values such as `0`, negative numbers, or non-numeric strings are ignored and ccstatusline falls back to normal detection.

Claude Code 2.1.153 and later set `COLUMNS` to the current terminal width when running the status line. ccstatusline reads it after `CCSTATUSLINE_WIDTH` and before any probing, so on current Claude Code versions no width-detection subprocesses run. Invalid values fall back to detection the same way.

On Linux, width detection first uses `/proc` and the terminal device directly, avoiding subprocesses when that probe succeeds. Portable `ps`/`stty` fallbacks run without shell wrappers. A probe result is reused throughout one render. If no width is found, that result can also be cached for the same session across renders (default: 5 seconds); a detected width is always re-probed on the next render so resizes take effect immediately. Adjust **Terminal Width Cache TTL** under **Configure Status Line**, or set `terminalWidthCacheTtlSeconds` to `0-300` in `settings.json`; `0` disables the cache across renders.

## Powerline Auto-Alignment

Powerline Setup can align widgets into shared columns across multiple status lines; press `a` there to toggle **Align Widgets**. When auto-alignment makes a naturally wide value stretch later columns, select that widget in the line editor and press `x` (**exclude align**). The selected widget and everything after it on that line keep their natural widths, while earlier columns remain aligned. This control is available only when Powerline auto-alignment is enabled and the selected widget is not merged into the previous widget.

## Global Options

Configure global formatting preferences that apply to all widgets:

![Global Options](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/global.png)

### Default Padding & Separators

- **Default Padding** - Add consistent padding around each widget
- **Padding Side** - Choose whether default padding applies to **Both** sides (default), **Left only**, or **Right only**
- **Default Separator** - Automatically insert a separator between all widgets
  - Press **(p)** to edit padding
  - Press **(d)** to cycle padding side
  - Press **(s)** to edit separator
- Manual separators look past widgets that render empty, so the intended separator remains between visible neighbors without duplicating an earlier visible boundary. Inherited separator colors come from the actual preceding visible widget.

<details>
<summary><b>Global Formatting Options</b></summary>

- **Inherit Colors** - Default separators inherit foreground and background colors from the preceding widget
  - Press **(i)** to toggle
- **Global Bold** - Apply bold formatting to all text regardless of individual widget settings
  - Press **(o)** to toggle
- **Minimalist Mode** - Force widgets into raw-value rendering globally for a cleaner, label-free status line
  - Press **(m)** to toggle
- **Number Formatting** - Choose precise, compact, or whole-number output independently for token, speed, percent, memory, and cost values
  - Press **(n)** to configure each number type; a global choice overrides per-widget formatting for that type
- **Override Foreground Color** - Force all widgets to use the same text color, or a whole-line **gradient** (see below)
  - Press **(f)** to cycle through colors
  - Press **(g)** to choose a gradient
  - Press **(x)** to clear override
- **Override Background Color** - Force all widgets to use the same background color
  - Press **(b)** to cycle through colors
  - Press **(c)** to clear override

</details>

> 💡 **Note:** These settings are applied during rendering and don't add widgets to your widget list. They provide a consistent look across your entire status line without modifying individual widget configurations.

> ⚠️ **VSCode Users:** If colors appear incorrect in the VSCode integrated terminal, the "Terminal › Integrated: Minimum Contrast Ratio" (`terminal.integrated.minimumContrastRatio`) setting is forcing a minimum contrast between foreground and background colors. You can adjust this setting to 1 to disable the contrast enforcement, or use a standalone terminal for accurate colors.

## Widget Styling

The color editor can adjust foreground color, background color, bold, dim, and gradients per widget:

- Use `←` / `→` to cycle the selected foreground or background color.
- Press `f` to switch between foreground and background editing.
- Press `b` to toggle bold.
- Press `d` to cycle dim styling: off → whole widget → parenthesized text only → off.
- Press `r` to reset styling on the selected widget, or `c` to clear styling on every widget in the line.

## Gradient Colors

A foreground color can be a multi-stop **gradient** instead of a solid. Colors interpolate in OKLab for perceptually even blends. A gradient value takes one of three forms, all prefixed `gradient:`:

- **Named preset** — `gradient:atlas` (case-insensitive). Built-in presets: `atlas`, `cristal`, `teen`, `mind`, `morning`, `vice`, `passion`, `fruit`, `instagram`, `retro`, `summer`, `rainbow`, `pastel`.
- **Dash stops** — `gradient:RRGGBB-RRGGBB[-RRGGBB...]` (two or more bare or `#`-prefixed hex stops).
- **Comma stops** — `gradient:hex:RRGGBB,#RRGGBB,RRGGBB` (two or more `hex:`/`#`/bare stops).

Gradients apply at **two scopes**:

- **Per-widget** — set a widget's color to a gradient so its text carries its own self-contained sweep. In the color menu (foreground, 256-color or truecolor mode), press **(g)** to open the gradient picker, then choose a preset or enter custom start/end hex stops.
- **Whole line** — set `overrideForegroundColor` to a gradient spec to paint the entire status line with one continuous sweep, each character colored by its column position. In the Global Overrides menu, press **(g)** on Override FG Color to open the same gradient picker, or author the value directly in `settings.json`.

Gradients self-degrade where they can't render: at Basic or No Color levels, gradient settings are preserved but render as plain text. In Powerline mode, global foreground gradients color widget text while separators and caps keep Powerline's normal foreground/background contrast rules; per-widget gradients collapse to their first stop when using 256-color or truecolor output.

## Claude Code Status Line Settings

When ccstatusline is installed in Claude Code, the main menu includes **Configure Status Line**. Claude Code versions >=2.1.97 support `statusLine.refreshInterval`; ccstatusline can set it to `1-60` seconds, defaults fresh supported installs to `10` seconds, and removes the setting when the input is left empty. Reinstalling preserves an existing refresh interval even if the Claude Code version check fails.

The same menu controls these ccstatusline cache settings, saved with **Save & Exit** or `Ctrl+S`:

| Setting | JSON key | Default | Range | Meaning of `0` |
| --- | --- | --- | --- | --- |
| Git Cache TTL | `gitCacheTtlSeconds` | 5 seconds | 0–60 seconds | Reuse until `.git/HEAD` or `.git/index` modification times change; no age-based expiry |
| Custom Command Cache TTL | `customCommandCacheTtlSeconds` | 0 seconds | 0–60 seconds | Run commands on every render |
| Terminal Width Cache TTL | `terminalWidthCacheTtlSeconds` | 5 seconds | 0–300 seconds | Re-probe on every render, even after no width was found |

Git commands run on cache misses with a five-second timeout. Persistent caches are separate for each repository and working directory, so sessions in different subdirectories do not evict each other's results. The cache lifetime starts when each command finishes, including failed or timed-out commands. Calls are skipped when ccstatusline can determine that the directory is outside any repository. JJ commands also have a five-second timeout. A timed-out command follows the normal missing-data path for its widget.

### Status line empty in one folder but fine elsewhere

Claude Code only runs a custom `statusLine` command in a workspace whose trust dialog has been accepted (since Claude Code 2.1.51). Since 2.1.232, a git repository nested under an already-trusted parent folder no longer inherits that trust, and Claude Code does not always show the trust dialog again. In such a folder, ccstatusline is never invoked, so the status line renders as an empty row even though running `ccstatusline` by hand in the same folder works and other folders still show it.

To confirm, look up the project path in `~/.claude.json` under `projects` and check its `hasTrustDialogAccepted` value. Setting it to `true` (or accepting the trust dialog when Claude Code shows it) and starting a new session restores the status line.

### Skills always shows none

The Skills widget reads skill activity recorded by Claude Code hooks, which run your status line command with `--hook`. Saving the configuration adds them only when that command contains `ccstatusline`, since any other command may be another tool's script; the TUI says so when a save leaves them out. If your status line command is a wrapper script that runs ccstatusline, put `ccstatusline` in the script's name (for example `~/.claude/ccstatusline-wrapper.sh`), have it pass its arguments and input on (`ccstatusline "$@"`), and save again.

## Usage Credentials and Cache

Usage API requests read credentials from the active Claude config directory's `.credentials.json` on Linux and Windows. On macOS, a custom `CLAUDE_CONFIG_DIR` selects its matching Keychain service first, then falls back only to that profile's credentials file. `CLAUDE_SECURESTORAGE_CONFIG_DIR`, when set, overrides the value used to select the Keychain service; an empty value selects the default service lookup. With the default service lookup, ccstatusline tries `Claude Code-credentials` by service name, then retries that service with the OS username if no OAuth token was found, then tries matching suffixed services and the credentials file. A successful service-only lookup still takes precedence; the username retry does not replace a stale but well-formed token.

Usage caches and backoff locks are stored separately for each effective Claude config directory, so profiles sharing a home do not replace each other's data or block each other's requests. File names use a hash of the resolved config directory, including for the default profile. The old shared `usage.json`, `usage.lock`, and `usage-credentials.lock` files are ignored and left untouched; after upgrading, each profile fills a new cache on its next lookup instead of migrating shared data or backoff deadlines.

The usage cache uses a fingerprint of the refresh token when available, falling back to the access token. Access-token rotation with an unchanged refresh token preserves fresh and stale usage snapshots, including during rate-limit backoff; a changed login fingerprint invalidates the old account's cache.

When a failed or backed-off request falls back to stale cache data, usage and reset values for windows whose reset time has passed are discarded. Other valid weekly or extra-usage fields remain available; widgets missing a required value use the current payload when available or their usual error/hidden state.

Each macOS Keychain command has a five-second timeout. If a command times out, ccstatusline skips all remaining Keychain probes for that lookup and tries the current profile’s credentials file. When no OAuth credentials are found, the lookup backs off for 30 seconds for that profile, so a newly signed-in account may take up to 30 seconds to appear. Usage cache files dated more than 180 seconds into the future are treated as stale.

Claude Account Email uses the same credentials to look up the account's email from `/api/oauth/profile`. The answer is cached per login fingerprint, so an access-token refresh does not repeat the request. A failed lookup is retried after 30 seconds, or after the `Retry-After` of a 429 response (five minutes without one). Each login has its own cache and backoff files. Concurrent lookups for the same login are coordinated, and a failure does not shorten an existing backoff deadline. Concurrent lookups for different logins retain both cached emails. Existing matching entries in the old shared email cache remain usable. If credentials exist but their email lookup fails or is backed off, the widget is hidden instead of showing an unverified previous account. Without OAuth credentials, it can still show `oauthAccount.emailAddress` from `.claude.json`. Cached email is used only for the current login fingerprint.

### Proxy Settings

Usage and Claude Account Email requests to `api.anthropic.com` and Claude Status requests to `status.claude.com` honor uppercase `HTTPS_PROXY`. Both `NO_PROXY` and `no_proxy` supply exclusions; matching either variable sends the request directly.

Exclusions are separated by commas or whitespace and matched without regard to case. Use `*` for all hosts, a hostname such as `api.anthropic.com`, or a domain such as `anthropic.com`, `.anthropic.com`, or `*.anthropic.com` to match that domain and its subdomains. An optional `:443` suffix is supported; entries for other ports do not match these HTTPS requests.

Each request has a total five-second deadline, including the wait for a proxy to answer CONNECT. The usual stale-cache and error-display behavior applies when the deadline expires.

## Configuration Import and Export

The TUI main menu can move configurations between machines or preserve a backup:

- **Export Config** writes the current in-memory configuration to a JSON file, including edits that have not been saved to `settings.json` yet. The default destination is `~/ccstatusline-config.json`; parent directories are created as needed, and the export records the ccstatusline version that created it.
- **Import Config** reads a JSON file, validates it, migrates supported older formats, rejects files from newer schema versions, and shows the effective changes before anything is applied.

The import preview follows the highlighted action:

- **Replace All** replaces user-facing settings with the validated import and current defaults for omitted fields.
- **Merge** overlays only fields explicitly present in the imported file, preserving current values for omitted settings.

Both modes keep machine-local installation metadata and ignore schema/update metadata from the imported file. Applying an import updates only the TUI's working configuration; review the result, then choose **Save & Exit** or press `Ctrl+S` to persist it.

If the selected mode adds Custom Command shell commands that are not already in the current configuration, the preview lists each new command in full. Choosing **Replace All** or **Merge** then opens a confirmation with **Cancel** selected by default. Choose **Apply and run these commands** to accept, or Cancel/Escape to return to the preview. Imports without new commands apply immediately. Preview values, paths, and commands display control characters as `\uXXXX`, making them visible without executing terminal controls.

## Settings Recovery

If `settings.json` is unreadable or invalid, ccstatusline leaves the file unchanged, renders with built-in defaults for that run, and prepends an invalid-config warning badge to the status line. The TUI shows the same warning and asks for confirmation before either **Save & Exit** or `Ctrl+S` replaces the invalid file. Fix the JSON to preserve its contents, or confirm the save to replace it with the configuration currently shown in the TUI.

Installation also stops if Claude Code's own `settings.json` cannot be read or parsed, leaving that file unchanged and showing the error. Correct the file before trying the installation again.

On systems with POSIX file permissions, saving an existing ccstatusline settings file preserves restrictive permissions such as `0600`, including when saving through a symlink. Claude Code settings backups (`.bak` and `.orig`) are created with the source file's permissions, subject to the process umask.

## Block Timer Widget

The Block Timer widget helps you track your progress through Claude Code's 5-hour conversation blocks:

![Block Timer](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/blockTimer.png)

**Display Modes:**
- **Time Display** - Shows elapsed time as "3hr 45m" (default)
- **Progress Bar** - Full width 32-character progress bar with percentage
- **Progress Bar (Short)** - Compact 16-character progress bar with percentage

**Features:**
- Prefers the reported usage reset time and falls back to transcript timestamps, ignoring sidechain and rejected-request rows
- Floors the transcript-derived block start time to the hour for consistent tracking
- Shows "Block: 3hr 45m" in normal mode or just "3hr 45m" in raw value mode
- Progress bars show completion percentage (e.g., "[████████████████████████░░░░░░░░] 73.9%")
- Use **(p)** to cycle time/full bar/short bar, **(s)** for compact time mode, and **(v)** to invert fill in progress mode

## Raw Value Mode

Some widgets support "raw value" mode which displays just the value without a label:
- Normal: `Model: Claude 3.5 Sonnet` → Raw: `Claude 3.5 Sonnet`
- Normal: `Session: 2hr 15m` → Raw: `2hr 15m`
- Normal: `Block: 3hr 45m` → Raw: `3hr 45m`
- Normal: `Ctx: 18.6k` → Raw: `18.6k`

To keep a label but change it, select the widget and press `e` (`(e)dit label…`) instead. The label is replaced verbatim, so include any trailing space or colon yourself (e.g. `M ` renders `M Claude 3.5 Sonnet`); an empty label drops it, and Tab in the editor resets it to the default. Widgets whose label changes with their mode (e.g. `Ctx Used:`/`Ctx Left:`, or `Block:` vs `Block ` before a progress bar) use the one custom label in every mode, even one that matches the current mode's default. The editor row shows `(label: "M ")` while a custom label is set; `e` is hidden while raw value is on, since the label isn't rendered then.

## Number Formatting

Numeric widgets support three display styles without changing their underlying values:
- **Precise** (default) keeps the formatter's normal trailing zeros, such as `1.0M` or `$1.20`
- **Compact** removes insignificant trailing zeros while preserving real fractions, such as `1M` or `1.1M`
- **Whole** rounds the displayed value to zero decimal places, such as `1M`

Select a numeric widget in the line editor and press `.` to cycle its style. In **Global Overrides**, press `n` to set a style for all token, speed, percent, memory, or cost widgets; that per-type global setting takes precedence over individual widget styles. Advanced configurations can also set `numberFormat.decimals` from `0` to `6` on a widget or number type in `settings.json`; the style then controls whether those decimal places are retained, trimmed, or suppressed.

## Widget Editor Keybinds

Common controls in the line editor:
- `↑/↓` select widget
- `←/→` open the type picker for the selected widget
- navigation wraps at list boundaries, including move/reorder mode
- `a` add widget via the picker
- `i` insert widget via the picker
- `k` clone the selected widget
- `Enter` enter/exit move mode
- `d` delete selected widget
- `c` clear the current line
- `Space` cycle a manual separator character
- `r` toggle raw value (supported widgets)
- `e` edit the label shown before the value when raw value is off (labeled widgets)
- `.` cycle precise/compact/whole number formatting (supported widgets)
- `m` cycle merge mode (`off` → `merge` → `merge no padding`); on the last widget, clear an existing merge. A merge joins the widget to the next one. When the next one renders nothing (a widget hidden at zero or without data), the merge carries on past it only if that widget is merged onward too; otherwise it ends there, and the usual separator follows
- `x` exclude the selected widget and the rest of its line from shared Powerline column widths (shown only when Powerline auto-alignment is enabled)
- `Esc` go back

Widget picker:
- type to search categories and widgets
- supports substring, initialism, and fuzzy matching
- previews the highlighted widget in place for add, insert, and type changes; `Enter` applies the previewed choice, while cancelling discards it
- scrolls long lists around the selection, with counts of entries above and below the visible list
- `↑/↓` change selection, `Enter` continue/apply, `Esc` clear search/back/cancel

Text editors use a blinking bar cursor so trailing spaces remain visible. Label edits update the status-line preview as you type; `Enter` accepts them and `Esc` discards them.

The keybind footer in the TUI only shows shortcuts that apply to the currently selected widget. Plain-letter shortcuts ignore Ctrl and Alt/Option modifiers, so combinations such as `Ctrl+S` do not also trigger the letter action.

Widget-specific shortcuts:
- **Remote Control Status**: `e` edits the label in `label-check` and `label-mark` formats when raw value is off. The override is shared by these two formats; Tab in the label editor restores `remote `.
- **Glyph widgets** (Git Branch, Git Worktree, Git Worktree Mode, Git Staged, Git Unstaged, Git Untracked, Git Conflicts, Git Ahead/Behind, Git Status, Git Changes, Git Insertions, Git Deletions, Git Clean Status, Git Is Fork, JJ Revision, JJ Bookmarks, JJ Workspace, JJ Changes, JJ Insertions, JJ Deletions, Remote Control Status with Nerd Font icons): `g` set custom glyphs for the widget's symbols; Backspace in the editor renders without one, Shift+Tab toggles every symbol between none and default, and multi-symbol widgets (Ahead/Behind, Status, Conflicts, Changes, Clean Status, Remote Control Status on/off) edit each part in one list
- **Git Branch**: `l` toggle clickable branch links (GitHub, GitLab, self-hosted), `f` toggle fish-style abbreviation, `w` set a maximum visible width (blank removes the limit)
- **Git Worktree**: `f` toggle fish-style abbreviation
- **Git Root Dir**: `l` cycle IDE links (`off` → `VS Code` → `Cursor`), `w` set a maximum visible width (blank removes the limit)
- **Git PR**: `s` toggle review status, `t` toggle title (renders "MR" for GitLab origins)
- **Git remote widgets** (`Git Origin*` / `Git Upstream*`): `l` toggle clickable repo links
- **Git Origin Owner/Repo**: `o` show only the owner when the repo is a fork
- **Git Conflicts**: `z` toggles how a visible conflict-free tree renders (`⚠0` or the clean glyph); `g` edits the conflict and clean glyphs
- **Context % widgets**: `u` toggle used vs remaining display, `p` cycle percentage/short bar/short bar only
- **Session Cost Rate**: `t` switch between active time (how long Claude spent working, the default) and clock time (the whole session)
- **Block Usage / Weekly Usage / Weekly Sonnet Usage / Weekly Opus Usage / Weekly Fable Usage / Spend Limit Usage / Extra Usage Utilization**: `p` cycle percentage/full bar/medium bar/short bar/short bar only and `u` switch between used and remaining percentage in every display mode. The editor row labels the current direction as `used` or `remaining`, while the `u` helper names the direction it will switch to. Block and weekly usage widgets use `t` to toggle the time cursor in bar modes.
- **Extra Usage Daily Budget**: `w` toggle counting weekdays only (Saturday and Sunday, UTC, are skipped; today always counts)
- **Block Forecast**: `u` switch between projected used and remaining percentage
- **Block Limit Timer / Weekly Limit Timer / Weekly Fable Limit Timer**: `s` toggle compact time
- **Block Timer**: `p` cycle time/full bar/short bar, `s` toggle compact time, `v` invert fill in progress mode
- **Block Reset Timer**: `p` cycle time/full bar/short bar, `s` toggle compact time/date, `t` toggle exact reset date/time, `f` toggle 12/24-hour display in date mode, `z` edit timezone in date mode, `l` edit locale in date mode, `v` invert fill in progress mode
- **Weekly Reset Timer**: `p` cycle time/full bar/short bar, `s` toggle compact time/date, `t` toggle exact reset date/time, `o` toggle hours-only in time mode, `f` toggle 12/24-hour display in date mode, `z` edit timezone in date mode, `l` edit locale in date mode, `v` invert fill in progress mode
- **Context Bar**: `p` cycle medium/full/short/short-only progress bar
- **Compaction Counter**: `v` cycle value (count/auto/manual/unknown/reclaimed), `f` cycle format, `n` toggle Nerd Font icon in icon mode, `s` toggle trigger split (auto/manual/unknown), `t` toggle tokens reclaimed
- **Cache widgets** (Cache Hit Rate, Cache Read, Cache Write): `t` toggle turn/session scope
- **Cache Timer**: `t` cycle the fallback 5-minute/1-hour TTL (reported `5m`/`1h` takes precedence), `g` customize the working/fresh/draining/urgent/cold glyphs; Working is used only in the transcript fallback
- **Sandbox Status**: `f` cycle glyph/text/word format, `n` toggle Nerd Font lock icons in glyph mode
- **Claude Status**: `h` toggle the 48-hour incident-history strip, `l` toggle the link to the status page
- **Voice Status**: `f` cycle format, `n` toggle Nerd Font microphone icons
- **Fast Mode**: `f` cycle format, `n` toggle Nerd Font lightning icons
- **Current Working Dir**: `l` cycle links (`off` → file manager → VS Code → Cursor; off by default), `h` home abbreviation, `s` segment editor, `f` fish-style path, `g` optional leading glyph (off by default; pair with raw value to replace the `cwd:` label with the glyph)
- **Skills**: `v` cycle view mode, `l` edit list limit in list mode
- **Input Speed / Output Speed / Total Speed**: `w` edit the rolling window in seconds
- **Custom Text / Custom Symbol**: `e` edit text or symbol
- **Custom Command**: `e` command, `w` max width, `t` timeout, `p` preserve ANSI colors
- **Link**: `u` URL, `e` link text
- **Vim Mode**: `f` cycle format, `n` toggle Nerd Font icons

## Hiding Widgets Conditionally

Widgets that can hide themselves share a single `h` (`(h)ide…`) keybind in the
line editor. It opens a checklist of the hideable states the selected widget
supports; toggle entries with `Space` and confirm with `Enter`. Enabled states
appear in the editor as `(hide: no-git, zero)`.

Supported states by widget family:
- **Git widgets**: `no-git` hides the `(no git)` placeholder outside a repo
- **Git count widgets** (`Git Changes`, `Git Insertions`, `Git Deletions`, `Git Staged/Unstaged/Untracked Files`, `Git Conflicts`): `zero` hides the widget while its count is zero
- **JJ widgets**: `no-jj` hides the `(no jj)` placeholder outside a jj repo
- **Git Origin widgets**: `no-remote` hides the `no remote` placeholder
- **Git Upstream widgets / Git Ahead/Behind**: `no-upstream` hides the `no upstream` placeholder
- **Git Ahead/Behind**: `zero` hides `↑0↓0` when the branch is not diverged (enabled by default; uncheck it to show zeros)
- **Git PR** (rendered as "MR" for GitLab origins): `no-data` hides the `(no PR)` placeholder, `status` and `title` hide those segments of the PR display
- **Git CI Status**: `no-data` hides the `-` placeholder when the branch has no pull request or no readable check rollup
- **Git Is Fork**: `not-fork` hides the widget when the repo is not a fork
- **Token widgets**: `zero` hides `0` token counts at session start
- **Session Cost**: `zero` hides `$0.00`
- **Session Clock**: `zero` hides durations under one minute
- **Block Timer**: `no-data` hides the `0hr 0m` / empty-bar display when no block is active
- **Block Reset Timer / Weekly Reset Timer**: `no-data` hides both the `[Loading]` placeholder and the usage-error placeholders while no reset window is available
- **Block Reset Timer**: `under-limit` hides the timer until the 5-hour block's usage reaches 100%, so the reset countdown appears only once the block's limit is hit. It reads the block's raw percent from the usage API, so a usage percent shown as `100%` after rounding 99.7% still counts as under the limit. The status payload's percent comes from that session's last response and stops moving while the session sits idle, so it's used only when the API can't be reached. The API's answer is cached for 3 minutes and shared by every session. A cached answer from a block that has already reset (the cache outliving the reset, or the API failing since) is ignored, and the payload's percent stands in until a fresh one arrives.
- **Block Usage**: `at-limit` hides the percent once the 5-hour block's usage reaches 100%, by the same check as Block Reset Timer's `under-limit`, so with both on the reset countdown takes the percent's place at the limit, in the same render. With `under-limit` on, the timer appears only there, so a label like `5h reset ` (set with `e`) keeps the 5h label in front of the countdown
- **Input/Output/Total Speed**: `no-data` hides the `—` placeholder when no speed data exists
- **Output Style**: `default-value` hides the widget when the style is `default`
- **Fast Mode**: `off` hides the widget when fast mode is disabled; a missing `fast_mode` field always hides it
- **Compaction Counter**: `zero` hides the counter before any compaction occurs
- **Skills**: `empty` hides the widget before any skill is used
- **Extra Usage widgets**: `disabled` hides the `n/a` display when extra usage is off, `no-data` hides the error placeholder when usage data is unavailable
- **Block / Weekly / Weekly Sonnet / Weekly Opus / Weekly Fable Usage**: `no-data` hides the error placeholder (`[No credentials]`, `[Timeout]`, `[Rate limited]`, `[API Error]`, `[Parse Error]`) when usage data is unavailable
- **Cache widgets** (`Cache Hit Rate`, `Cache Read`, `Cache Write`, `Cache Timer`): `empty` hides the widget when there is no cache activity, and on Cache Timer when neither usable reported cache state nor a transcript cache anchor is available
- **Cache Misses / Cache Miss Tokens**: `zero` hides the widget while the session has no prompt cache misses
- **Custom Text / Custom Symbol**: `merge-target-hidden` hides the item when the widget it is merged with renders nothing, so icon prefixes/suffixes disappear together with their widget

In `settings.json`, the enabled states are stored as a comma-separated list in
the item's metadata, e.g. `"metadata": { "hide": "no-git,zero" }`. An empty
list (`"hide": ""`) opts out of default-enabled states such as Git
Ahead/Behind's `zero`. Configs from older versions that used per-widget
boolean keys (`hideNoGit`, `hideNoJj`, `hideNoRemote`, `hideZero`,
`hideWhenEmpty`, `hideIfDisabled`, `hideStatus`, `hideTitle`,
`hideWhenNotFork`) are converted to the unified key automatically by the
settings migration on first load. After that, downgrading to an older
ccstatusline keeps the config readable, but older versions ignore the `hide`
key, so previously hidden placeholders show again until you upgrade back.

## Custom Widgets

### Custom Text Widget

Add static text to your status line. Perfect for:
- Project identifiers
- Environment indicators (dev/prod)
- Personal labels or reminders

### Custom Symbol Widget

Add a single symbol or emoji to your status line when you want a compact visual marker:
- Nerd Font or Powerline-friendly glyphs
- Status markers like `●`, `✓`, or `⚠`
- Emoji shorthand for environments, workflows, or attention cues

### Custom Command Widget

Execute shell commands and display their output dynamically:

- Runs whenever Claude Code updates the status line by default; optionally reuse output with **Custom Command Cache TTL** under **Configure Status Line** (`customCommandCacheTtlSeconds`, `0-60` seconds, default `0`)
- Receives the full Claude Code JSON data via stdin (model info, session ID, transcript path, etc.)
- Also includes `terminal_width` — the detected terminal width in columns, added by ccstatusline (omitted when it can't be determined) — so scripts can adapt their output to the available space
- Displays command output inline in your status line
- Configurable timeout (default: 1000ms)
- Optional max-width truncation
- Optional ANSI color preservation (`preserve colors`)
- Examples:
  - `pwd | xargs basename` - Show current directory name
  - `node -v` - Display Node.js version
  - `git rev-parse --short HEAD` - Show current commit hash
  - `date +%H:%M` - Display current time
  - `curl -s wttr.in?format="%t"` - Show current temperature
  - `npx -y ccusage@latest statusline` - Display Claude usage metrics (set timeout: 5000ms)
  - `cc-session-num` - Show current session rank (`#1`, `#2`, …) from [ccsessions](https://github.com/treebird7/ccsessions)

With caching enabled, both output and failure markers are reused until the TTL expires. Entries are separated by command, working directory, session ID, terminal width, and timeout. Other stdin changes, such as token counts, do not invalidate an entry, so choose a TTL that suits how often the output needs to change. Without a session ID, reuse is limited to the current process. TUI previews show a command placeholder without executing it.

> ⚠️ **Important:** Commands should complete quickly to avoid delays. Long-running commands are terminated at the configured timeout, and inherited output pipes cannot keep capture waiting indefinitely after that deadline. On Linux/macOS, timeout termination targets the command's process group; on Windows, it targets the shell process. If you're not seeing output from your custom command, try increasing the timeout value (press 't' in the editor).

Rendered widget output filters terminal controls such as clipboard writes, title changes, cursor movement, and screen clearing. With **preserve colors** enabled, ANSI styling and OSC 8 hyperlinks remain supported, including their 8-bit control forms; the widget's background, bold and dim are restored after each reset in the command's output, in both plain and Powerline mode.

Output capture is limited to 1 MiB; exceeding it displays `[Error]`. Successful output is limited to 16,384 characters before color handling and optional max-width truncation.

> 💡 **Tip:** Custom commands can be other Claude Code compatible status line formatters. They receive the same JSON via stdin that `ccstatusline` receives from Claude Code (augmented with a `terminal_width` field), allowing you to chain or combine multiple status line tools.

### Link Widget

Create clickable links in terminals that support OSC 8 hyperlinks:
- `metadata.url` - target URL (http/https)
- `metadata.text` - optional display text (defaults to URL)
- Falls back to plain text when URL is missing or unsupported

## Integration Example: ccusage

[ccusage](https://github.com/ryoppippi/ccusage) is a tool that tracks and displays Claude Code usage metrics. You can integrate it directly into your status line:

1. Add a Custom Command widget
2. Set command: `npx -y ccusage@latest statusline`
3. Set timeout: `5000` (5 seconds for initial download)
4. Enable "preserve colors" to keep ccusage's color formatting

![ccusage integration](https://raw.githubusercontent.com/sirmalloc/ccstatusline/main/screenshots/ccusage.png)

> 📄 **How it works:** The command receives Claude Code's JSON data via stdin, allowing ccusage to access session information, model details, and transcript data for accurate usage tracking.

## Integration Example: AIWatch

[AIWatch](https://ai-watch.dev) monitors the live status of 30+ AI APIs and apps (Claude, GPT, Gemini, …). Surfacing it in your status line answers "is Claude slow because of me, or because the API is degraded?" without leaving the terminal.

1. Add a Custom Command widget
2. Set command:

   ```bash
   ( curl -sf --max-time 2 https://ai-watch.dev/api/status/cached | jq -r '[.services[] | select(.status != "operational") | "🔴 " + .name] | .[0:3] | join(" ")' ) 2>/dev/null || true
   ```

3. Set timeout: `2000` (the `curl` itself caps at 2s; the outer `|| true` keeps the widget silent on any failure)
4. Leave "preserve colors" off — the output is a plain emoji + name list

When every tracked service is operational the command prints nothing, so the widget renders empty and manual separators collapse around it. The endpoint is JSON, CORS-enabled, and served with a ~5-minute cache.

> 📄 **Variants:** See [ai-watch.dev/#statusline](https://ai-watch.dev/#statusline) for count-only, compact, provider-scoped, and clickable OSC 8 link presets.

## Integration Example: ccsessions

[ccsessions](https://github.com/treebird7/ccsessions) is a CLI session manager for Claude Code. Its companion script `cc-session-num` shows the current session's rank (`#1`, `#2`, …) matched against the same mtime-sorted list that `ccsessions` uses.

1. Install `cc-session-num`:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/treebird7/ccsessions/main/cc-session-num \
     -o ~/.local/bin/cc-session-num && chmod +x ~/.local/bin/cc-session-num
   ```

2. Add a Custom Command widget
3. Set command: `cc-session-num`
4. Leave timeout at default (the script reads `~/.claude/projects/` locally and returns in milliseconds)

The widget renders nothing when the current session isn't found, so manual separators collapse around it cleanly.

> 📄 **How it works:** `cc-session-num` reads `CLAUDE_CODE_SESSION_ID` from the environment (set by Claude Code), then ranks `~/.claude/projects/*/*.jsonl` files by modification time — the same sort order `ccsessions` uses — and prints the matching position.

## Smart Truncation

When terminal width is detected, status lines automatically truncate with ellipsis (`...`) if they exceed the available width, preventing line wrapping.
Truncation is ANSI/OSC-aware, so preserved color output and OSC 8 hyperlinks remain well-formed.
