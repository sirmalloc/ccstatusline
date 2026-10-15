# ccstatusline on-demand lifecycle bench (issue #53)

Lazy start + idle auto-stop under a 20–30 concurrent-session burst, versus the
same burst rendered one-shot. Companion to [daemon-19-bench.md](daemon-19-bench.md);
raw numbers in [daemon-53-results.json](daemon-53-results.json), harness in
`scripts/benchmark-lifecycle-53.py`.

- runtime: `bun src/ccstatusline.ts` (dev checkout; the wrapper's lazy start
  resolves the entry from its own install root)
- machine: Apple M5, 10 cores, macOS-26.6.2-arm64-arm-64bit
- generated: 2026-10-01T14:08:47+0800

## Workload

Each scenario runs N concurrent clients over two waves. Sessions alternate
between a 500-row and a 10 000-row transcript and between a dirty and a clean
git repo, so the daemon's caches hold a cold/warm mix (both transcript sizes
parse; the two repos render distinct git-changes lines). The lazy scenarios
start with **no daemon process at all** — the first wave includes the
on-demand start raced by all N clients.

## Per-scenario cost

| scenario | renders | CPU s/render | p50 ms | p95 ms | p99 ms | failures |
|---|---|---|---|---|---|---|
| oneshot-20-cold | 20 | 188.0 | 434 | 481 | 481 | 0 |
| oneshot-20-warm | 20 | 182.1 | 415 | 451 | 453 | 0 |
| lazy-20-cold (incl. daemon boot) | 20 | 237.0 | 799 | 902 | 905 | 0 |
| lazy-20-warm | 20 | 42.4 | 151 | 271 | 276 | 0 |
| oneshot-30-cold | 30 | 186.4 | 930 | 1035 | 1040 | 0 |
| oneshot-30-warm | 30 | 194.1 | 808 | 934 | 950 | 0 |
| lazy-30-cold (incl. daemon boot) | 30 | 229.7 | 1023 | 1149 | 1202 | 0 |
| lazy-30-warm | 30 | 49.4 | 185 | 481 | 528 | 0 |

## One-shot vs shared (lazy)

| sessions | phase | one-shot CPU s/render | shared CPU s/render | CPU reduction | one-shot p95 | shared p95 | hashes equal |
|---|---|---|---|---|---|---|---|
| 20 | cold | 188.0 ms | 237.0 ms | −26.0% | 481 ms | 902 ms | yes |
| 20 | warm | 182.1 ms | 42.4 ms | **76.7%** | 451 ms | 271 ms | yes |
| 30 | cold | 186.4 ms | 229.7 ms | −23.2% | 1035 ms | 1149 ms | yes |
| 30 | warm | 194.1 ms | 49.4 ms | **74.5%** | 934 ms | 481 ms | yes |

The cold-wave regression is the on-demand start itself, paid once per idle
period: every client that finds no discovery runs `daemon start`, so a burst of
N simultaneous first renders spawns N short-lived starters (one wins the #47
cold-start lock, the rest converge on its server). Warm bursts — the steady
state while sessions are open — keep the 75–80% CPU reduction of #19/#50 and
cut p95 roughly in half.

## Burst behavior (acceptance: no 503 storm)

- lazy-30 cold wave: all 30 clients raced the lazy start; the discovery pid was
  identical before and after both waves — exactly one daemon served the whole
  scenario (no second server, no restart).
- Daemon counters, lazy-30: `requests=176, ok=91, busy=85`, client failures 0.
  The bounded queue (`MAX_IN_FLIGHT_RENDERS = 4`) rejected concurrent cold
  renders with 503s exactly as designed, and the client's retry ladder
  (0.05 s → 1 s, 8 s budget) absorbed all of them.
- Note from an earlier (unrecorded) run: under the cold 30-burst the
  dirty-repo renders once collapsed to the clean-repo line (git reads failing
  under load); the recorded run shows the expected two distinct lines with
  identical output between one-shot and shared. Watch for it when re-running.

## Idle auto-stop (acceptance: daemon disappears, render restarts it)

With `daemonIdleStopMinutes: 1` and zero requests:

- the daemon exited by itself after 72.2 s observed (1 minute configured; the
  idle check runs at `idle/5` cadence, here 12 s, so up to one interval of
  lateness),
- its discovery file was cleaned up (no stale state for the next start),
- the next client render lazily started a fresh daemon (new pid) and returned
  the rendered line with rc 0.

Default is 10 minutes; `0` disables auto-stop; any request (health included)
resets the clock, so busy periods keep the daemon alive without observers.

## Opt-in gating

The lazy start lives in the shared-mode client wrapper only — the file Claude
Code executes exclusively after `daemon install`. The one-shot render path
never spawns anything (covered by a test: one-shot render leaves the runtime
dir empty). `CCSTATUSLINE_NO_AUTOSTART=1` restores the fail-fast behavior.
