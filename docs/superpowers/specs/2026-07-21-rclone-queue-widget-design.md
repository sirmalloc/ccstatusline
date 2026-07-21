# RClone Queue Widget — Design

## Problem

`~/mounts/dropbox` (and similarly `~/mounts/gdrive`) are rclone VFS mounts writing to cloud storage asynchronously (`--dropbox-batch-mode async`). Writes land in the local VFS cache immediately but can queue for a while before actually uploading, especially under Dropbox rate-limiting (`too_many_requests` backoff). There is currently no at-a-glance way to see how large that pending-upload backlog is without manually grepping the rclone log or checking `systemctl status`. This design adds a ccstatusline widget that surfaces that queue length directly in the status line.

## Data source

The rclone systemd unit (`~/.config/systemd/user/rclone@.service`) runs with `--vfs-cache-poll-interval 1m` and `--log-file %h/.cache/rclone/%i.log`, which produces a periodic INFO-level line roughly once a minute:

```
2026/07/21 19:16:46 INFO  : Dropbox root '': vfs cache: cleaned: objects 56315 (was 56315) in use 1381, to upload 1374, uploading 6, total size 45.479Gi (was 45.479Gi)
```

There is no `--rc` remote-control API enabled on this system, so this log line is the only non-invasive, no-subprocess data source available. The widget reads `~/.cache/rclone/<remoteName>.log`, and extracts the `to upload (\d+)` figure from the most recent matching line.

This generalizes to any configured rclone remote by remote name (default `dropbox`; `gdrive` also works on this box since it uses the same `%i`-templated log path convention).

## Widget behavior

- **File:** `src/widgets/RCloneQueue.ts`, class `RCloneQueueWidget implements Widget`.
- **Category:** `'Environment'` (same as `FreeMemoryWidget`).
- **Display name:** `'RClone Queue'`.
- **Render format:** `RClone: <N>` normally; bare `<N>` when `item.rawValue` is set (existing raw-value convention, see `FreeMemoryWidget`).
- **Configurable remote name:** stored in `item.metadata.remoteName`, default `'dropbox'`. Editable via an in-TUI text editor triggered by a custom keybind (same UX pattern as `CustomTextWidget`'s `(e)dit text` — an `(e)dit remote` keybind opens a text input pre-filled with the current remote name).
- **Log path derivation:** `path.join(os.homedir(), '.cache', 'rclone', `${remoteName}.log`)`.
- **Fallback / "n/a" cases** (per explicit user choice — show a visible placeholder rather than hiding the widget):
  - Log file does not exist at the derived path.
  - Log file exists but contains no `to upload (\d+)` match yet (e.g. mount just started, hasn't hit its first poll interval).
  - In both cases: render `RClone: n/a` (or bare `n/a` in raw mode).
- **A genuine queue length of 0 is a real value**, rendered as `RClone: 0` — it is not treated as a fallback/empty case.

## Performance: caching

Status lines can render many times per second in an active terminal session (this codebase has prior perf work specifically about avoiding per-render subprocess/syscall storms — see the git-widget cache in `src/utils/git.ts`). Reading and regex-scanning a log file per render is cheap relative to spawning a process, but still unnecessary work when the underlying data only changes once a minute.

- In-process cache: a `Map<remoteName, { value: number | null, createdAt: number }>`.
- TTL: 15 seconds, fixed constant (not user-configurable — the underlying source only updates every ~60s, so 15s is already a safe margin against staleness while cutting re-parses by ~4x during rapid re-renders).
- No persistent cross-process cache is needed (unlike the git cache, which caches expensive git subprocess calls across processes) — a single log-tail read is cheap enough that in-process-only caching suffices.
- To avoid reading an ever-growing log file from the start every time, read only the last N bytes (e.g. last 64KB) via a seek-from-end read, then take the last regex match within that window. Rclone log files can grow large over weeks of uptime (observed >800k lines in production on this box), so a full-file read/scan must be avoided.

## Registration

Two-step registration, consistent with all existing widgets:

1. Export `RCloneQueueWidget` from `src/widgets/index.ts`.
2. Add `{ type: 'rclone-queue', create: () => new widgets.RCloneQueueWidget() }` to the widget list in `src/utils/widget-manifest.ts`.

No changes needed to a `WidgetType` union (the `type` field is a plain `z.string()`, not a strict enum) and no README/docs widget table exists to update (confirmed via search — no doc file lists widgets by name).

## Testing

`src/widgets/__tests__/RCloneQueue.test.ts`, following the existing widget test conventions (see `FreeMemory.test.ts`, `CacheWidgets.test.ts`):

- Log-parsing regex against fixture log content:
  - A normal line with `to upload N` → extracts `N`.
  - Multiple matching lines → picks the value from the most recent (last) one.
  - No matching line in the file → returns `null` (renders `n/a`).
  - Malformed/truncated line (e.g. log rotated mid-write) → does not throw, returns `null`.
- Missing log file entirely → returns `null` (renders `n/a`).
- Cache behavior: two renders within the 15s TTL window result in only one file read (verified via a spy/mock on the file-read call), and a render after TTL expiry triggers a fresh read.
- `rawValue` rendering: bare number vs `RClone: ` prefix.
- Remote-name metadata editor: default value, and that editing updates `item.metadata.remoteName`.

## Out of scope

- No dynamic color thresholds based on queue size (matches existing widgets' static-color convention — user can recolor via the standard color picker).
- No support for the `--rc` HTTP API path (not enabled in this environment; log-tailing is the only source implemented).
- No display of "uploading" (active transfer count) or total cache size — queue length only, per explicit choice.
