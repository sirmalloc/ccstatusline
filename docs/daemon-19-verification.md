# Daemon shared-mode acceptance run (issue #19)

Machine-readable results: `docs/daemon-19-results.json` (full per-run JSON with
latency arrays); generated tables: `docs/daemon-19-bench.md`. One-shot baseline
reference: `docs/baseline-14-verification.md`.

## What this is

One-shot vs shared-mode (daemon) render cost at 1/10/36/50 concurrent sessions,
cold and warm, small/large transcripts, slow custom command, plus a recovery
proof. Shared-mode aggregate CPU covers the daemon **and every client** (sh +
curl, all reaped children, `getrusage(RUSAGE_CHILDREN)`); one-shot covers a
fresh process per render and its git children. Same fixtures and wave pattern
for both sides; output hash of every render recorded.

## Acceptance gates (epic checklist)

| Gate | Target | Measured | Result |
|---|---|---|---|
| Aggregate-CPU reduction, warmed 36-session workload, daemon + clients | ≥50% | 180.0 → 34.7 ms CPU/render = **80.7%** (38.88 → 7.50 CPU-s total) | **PASS** |
| Output equality one-shot vs shared | 1 distinct hash per scenario | hashes=1 in every passing scenario; comparison rows all `output_hashes_equal=true` | **PASS** |
| Recovery (SIGKILL, dead-daemon wave, restart) | fail clean, byte-identical re-render | 50/50 clients failed rc≠0 with empty stdout; restart ready; 0 output mismatches; recovery gate PASS | **PASS** |
| Opt-in with tested return to one-shot | both directions tested | `daemon-shared-mode.test.ts`: enable/disable round-trip, verbatim restore, idempotent enable, refusals (corrupt config, Windows) | **PASS** |

Warm table (CPU ms/render; full p50/p95/p99 and RSS in the JSON):

| scenario | one-shot | shared | reduction |
|---|---:|---:|---:|
| s1-warm-small | 118.1 | 16.9 | 85.7% |
| s10-warm-small | 170.1 | 27.2 | 84.0% |
| s36-warm-small (gate) | 180.0 | 34.7 | 80.7% |
| s50-warm-small | 178.9 | 37.5 | 79.0% |
| s50-warm-large | 215.7 | 46.8 | 78.3% |

Aggregate RSS at 50 warm sessions: one-shot 2.8→3.5 GB (up to 5.7 GB in the
slow scenario) vs shared 0.35→0.56 GB; the daemon process stays ~0.4–0.6 GB
total while one-shot multiplies by session count.

## Measured limitation: 50 synchronous sessions with a 0.4 s custom command

`s50-shared-warm-small-slow` FAILED and is recorded as failed — twice,
reproducibly (initial run and a re-run). The daemon renders serially at
`MAX_IN_FLIGHT_RENDERS = 4`; a wave of 50 slow renders is a ~6–7 s queue, and
the client's bounded retry ladder (~8 s) does not guarantee a slot under that
contention, so some clients gave up with 503 busy. This is the designed
backpressure boundary, not a defect found by the gate: with the daemon down a
client fails with empty stdout, and a real Claude Code repaint simply tries
again on its next tick. The equivalent one-shot wave keeps all 50 sessions
rendering but costs 250 ms CPU/render and p95 2.6 s across up to 5.7 GB RSS.
Raising the retry budget until the scenario passes would have been tuning to
the benchmark, so the failure is reported as measured. Smaller slow waves and
all non-slow scenarios pass (10-session slow passes one-shot; the shared slow
pair at 50 sessions is the only failing row).

## Method and honesty notes

- Apple M5 (10 cores), macOS 26, `node dist/ccstatusline.js`, `CCSL_FORK=1`,
  `CCSTATUSLINE_WIDTH=120`, fresh HOME per scenario, one shared dirty git repo,
  per-session transcripts and session ids (no dedup collisions).
- Load gate `--max-load 14` with loadavg stamped per scenario; the machine was
  NOT idle (sibling agent sessions; ambient 1-min loadavg oscillated ~4–15).
  CPU and RSS are the stable metrics; latency percentiles under ambient load
  are upper bounds (shared p99 at 50 sessions grows with the busy-retry
  ladder by design).
- Busy retries are visible in daemon counters (`busy` vs `ok`); they are part
  of the shared cost and are included in the aggregate CPU.
- The `s50-warm-small-slow` one-shot row showed `hashes=2` in one earlier run
  (1 in the final run): the slow-command line is otherwise deterministic, so
  this is recorded rather than explained away.
- Idle-timer refreshes are not modeled as a separate phase; warm runs measure
  steady back-to-back waves and the daemon idle sweep runs only after 5 quiet
  minutes.
- Aggregate RSS is `ps`-sampled and undercounts short-lived children; peak RSS
  is exact (`ru_maxrss`).

## Verification summary

- Harness: `python3 scripts/benchmark-render.py --self-test` → PASS.
- Live CLI verification (isolated fake `CLAUDE_CONFIG_DIR`/`XDG_CONFIG_HOME`,
  real dist build): 19/19 — a piped render starts no daemon; `daemon install`
  switches the statusLine, remembers the previous command and starts the
  daemon; `daemon status` reports identity/uptime/counters and leaks no
  token; the wrapper renders through the daemon; after `daemon stop` the
  wrapper fails clean (rc=1, empty stdout, no auto-start); `daemon uninstall`
  restores the one-shot command verbatim and stays off; a second uninstall is
  an honest no-op.
- Final run: 21 scenarios, 20 passed, 1 failed as documented above (the run
  exits 1 — the failure is kept visible in the JSON/MD, not masked).
- `bun test`: 2732 passed / 0 failed (single full run at the end).
- `bun run lint`: clean (`tsc --noEmit` + ESLint `--max-warnings=0`).
