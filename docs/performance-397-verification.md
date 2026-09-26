# PR #2 adversarial verification and local follow-up

Verified on 2026-09-25; macOS 26 / arm64, Node 25.9.0, Bun 1.3.13.
Baseline: `35440e4`; PR: `9d56d93` + `1177422`. Follow-up: `164007b` on
`ao/ccstatusline-4/perf-followups`. PR #2 and its branch were not modified.
No push, PR update, or upstream publication was performed.

## Phase 1 verdicts

| Claim | Verdict and evidence |
| --- | --- |
| One `ps` answers both columns | **Confirmed on macOS and Linux procps-ng 4.0.2**. Actual host `ps` and an ephemeral Debian container emitted two headerless columns. Tested Linux default/`linux`, `posix`, `bsd`, and `sun` personalities. Whitespace and `ttys001`, `pts/4`, `ttyv0`, `ttyp0` fixture parsing work; missing TTY, `?`, and `??` become null. |
| Portable across BSD variants | **Refuted.** FreeBSD's format parser treats everything after the first `=` as a column header, including commas: `ppid=,tty=` means one PPID column headed `,tty=`. The PR tries to parse that header as a PID, stops, and falls back to `tput`. Use `ps -o ppid= -o tty= -p PID`: still one spawn. OpenBSD's parser instead splits commas first, like the tested macOS behavior. BSD conclusions are source/manual verification, not native BSD executions. [FreeBSD parser](https://github.com/freebsd/freebsd-src/blob/main/bin/ps/keyword.c), [FreeBSD manual](https://man.freebsd.org/cgi/man.cgi?query=ps&sektion=1), [OpenBSD parser](https://github.com/openbsd/src/blob/master/bin/ps/keyword.c). |
| Same ancestor behavior, modulo earlier inherited TTY | **Refuted as an unconditional parity claim.** The old walk checks generations 1–8; PR checks 0–7 and checks PPID validity *before* the current TTY. Fixtures: only generation 8 has width 160 → old 160, PR fallback 80; a parent with PPID 0 and valid width 120 → old 120, PR 80; caller TTY 100 / parent TTY 120 → old 120, PR 100. Inherited TTY is usually equal, but not guaranteed after a session/PTY change. |
| Two spawns become one per ancestor | **Confirmed structurally, qualified.** Inherited caller TTY: 2 → 1 `ps` calls. Detached caller, immediate parent TTY: 2 → 2, because PR first probes itself. No TTY through eight generations: 16 → 8, but coverage differs. |
| Failure/fallback parity | **Mostly confirmed, not exact.** `ps` failure and malformed/nonpositive PPIDs fall back safely; `stty -F`, `stty -f`, `tput`, memoization and disk-cache logic are unchanged. If the combined parent lookup fails, PR cannot continue using a separately obtained PPID as the old two-call sequence could. Fixtures reproduce old 140 versus PR fallback 80 for that failure sequence. |
| Proxy loading is conditional and survives builds | **Confirmed for the import change.** Both normal bundled dist and an explicitly `--packages=external` build run on Node 25 and Bun. Mocked HTTPS requests to both endpoints have no agent when unset, `HttpsProxyAgent` when set, and no requests when the URL is invalid. Uppercase `HTTPS_PROXY`/whitespace handling is unchanged. |
| Agent-load failures remain safe | **Confirmed.** In isolated copies of the PR modules, replacing the dynamic import target with a missing module yields usage `{error:'api-error'}`, status `null`, no HTTPS requests, no direct-network fallback, exit 0, and no stderr on Node 25, Bun, and real Node 14.21.3. Same outcome for invalid proxy URLs. These probes replace only unrelated config/color dependencies and mock transport; they do not prove a real proxy tunnel handshake. |
| No-proxy startup avoids undici | **Refuted for PR dist.** With proxy variables absent, both baseline and PR make one Yoga WASM `fetch` and instantiate WASM; `process.moduleLoadList` includes `internal/deps/undici/undici`. The proxy chunk is deferred, but another eager path remains. |
| CPU −24%, p50 373 → 224 ms | **Not reproduced (refuted for this workload).** Final uncontended-within-this-worker pair: CPU 268.8 → 247.9 ms (−7.8%); p50 283.7 → 239.9 ms. Earlier paired runs varied considerably; all 13 MB batches are preserved in the adjacent results JSON. The PR does not specify its exact fixture, Node version, settings, TTY ancestry or warmup, so this is not proof its original measurements were fabricated. |
| `compileForInternalLoader` 40.7 → 7.5 ms | **Refuted here.** Eight 500 µs-sampled profiles each: baseline mean **42.45 ms**, PR **35.91 ms**. Ranges 34.96–69.81 / 33.09–39.18 ms. These exploratory profiles used the initial 12.26 MB fixture before padding it to 13.009 MB for the benchmark. The no-proxy undici stack is `Yoga ya/c → fetch → requireBuiltin → compileForInternalLoader → undici`, not a proxy request. |

### Concrete review findings

1. **P1: BSD portability regression** in `getProcessAncestorInfo` (`terminal.ts`). Separate `-o` arguments fix the format without adding spawns. Linux documentation also warns that custom-header/comma interpretation can vary with personality, although tested procps 4.0.2 personalities accepted this exact empty-header form. [procps manual](https://man7.org/linux/man-pages/man1/ps.1.html)
2. **P2: narrowed ancestry and premature PPID guard** in `probeTerminalWidth`. Starting at `process.ppid` and examining a valid TTY before terminating on its PPID would restore the previous generation budget while retaining one spawn per ancestor. Not changed in this follow-up.
3. **P1: inaccurate startup-graph attribution**: the eager editor → Ink `useInput` → reconciler → Yoga route survives PR #2 and upstream #575. Lazy proxy imports alone do not remove undici from the built render path.

## Pre-existing Node 14 distribution blocker — repair out of scope

The actual package build **bundles** dependencies; `--packages=external` is not
in `package.json`. All third-party dependencies are devDependencies, so an
external build also requires a dependency-install/packaging policy not supplied
by the current manifest. It is not the shipped standalone build.

Bun 1.3.13 does not lower syntax for the supplied `--target-version=14` option:
`bun build --help` exposes environment targets, not this version option, and
both baseline and PR outputs retain `??=` and class fields. Public class fields
alone are not the demonstrated failure; **`??=` is the first actual rejection**.
Bun documents that its bundler does not down-convert syntax. [Bun bundler](https://bun.sh/docs/bundler)

Minimal repro, also run against the unmodified baseline:

```sh
bun run build
NODE14=/private/tmp/ccstatusline-perf-4/node-v14.21.3-darwin-x64/bin/node
printf '{"model":{"id":"claude-sonnet-4-5"}}' | "$NODE14" dist/ccstatusline.js
# ccstatusline-wckvcay0.js:15
# var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : ...
# SyntaxError: Unexpected token '??='
```

The explicitly external PR build also fails on `firstTimestampMs ??= timestampMs`.
Installed manifests require Node **>=22** for chalk 6.0.0 and **>=20** for Ink
6.2.0. Thus import syntax being supported is not distribution compatibility.
The on-demand proxy code itself passes the isolated Node 14.21.3 tests above;
that runtime was the official Darwin x64 binary running under Rosetta.
Per orchestrator decision, no build/dependency repair was attempted. This
follow-up adds no newer JS syntax or Node APIs; the distribution blocker remains.

## Phase 2: implemented win

`164007b` extends, rather than replaces, `35440e4`: keep its dynamic TUI entry
and split build, then move the eleven widget-editor implementations into lazy
chunks. A small React `lazy`/`Suspense` wrapper preserves the synchronous
`renderEditor` API. Render-time widget logic is unchanged; no new dependency.
The large diff is predominantly moving existing editor bodies.

Afterward a built no-proxy render records **0 fetches, 0 WASM initializations,
and no undici module**, versus 1/1/loaded at PR head. An isolated fresh-process
regression test checks the widget-registry import; existing glyph/locale/timezone
interaction tests now wait for the first lazy frame rather than sleeping 25 ms.
First opening an editor can suspend briefly (about 300 ms observed in tests).

### Before/after benchmark for this change

Final acceptance sequence (80 renders per row):

| Runtime / revision | CPU total | CPU/render | p50 | p95 | Wall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node / PR | 19.833 s | 247.9 ms | 239.9 ms | 309.6 ms | 4.826 s |
| Node / follow-up | 18.313 s | 228.9 ms | 244.3 ms | 352.9 ms | 5.099 s |
| Bun / PR | 13.702 s | 171.3 ms | 153.7 ms | 226.3 ms | 3.312 s |
| Bun / follow-up | 11.959 s | 149.5 ms | 132.9 ms | 186.2 ms | 2.809 s |

Final CPU improvement: **7.7% Node / 12.7% Bun**. **The final Node p50 regressed
1.8%**, so no universal latency improvement is claimed. Earlier batches were
faster: all recorded 13 MB batches average 256.7 → 219.5 ms CPU/render on Node
(−14.5%) and 171.9 → 144.8 ms on Bun (−15.8%). This is a shared development host,
not a quiet benchmark machine; exploratory runs also overlapped other verification
work. The final sequence had no other jobs from this worker. Prefer the explicit
final table over a selectively favorable trial.

All benchmark output hashes match:
`454f8606b708708a4afd72598c1493889cacba100fc86da1f418f1977c044f86`.

### Reproduction and artifacts

`scripts/benchmark-render.py` generates a **13,009,445-byte**, 10,000-record
synthetic transcript (alternating user/assistant; assistant usage populated),
runs four concurrent workers × twenty fresh processes, with one untimed warmup
per worker. Each worker has isolated HOME, USERPROFILE and CLAUDE_CONFIG_DIR;
proxy variables are absent. Default settings, empty non-Git cwd, TERM=xterm-256color,
no width override: the host has no controlling TTY and `tput` supplies a numeric
width, so width probing is not bypassed by the no-width disk cache. All workers
read the same fixture. CPU is child user+system time from `getrusage`; latency is
per-process wall time. No npm/npx startup or real API calls are benchmarked.

```sh
CCSTATUSLINE_BENCH_DIR=/tmp/ccstatusline-bench \
  python3 scripts/benchmark-render.py /opt/homebrew/bin/node /absolute/path/to/dist/ccstatusline.js label
# Repeat for baseline / PR / follow-up and /opt/homebrew/bin/bun.
```

Committed summary: `docs/performance-397-results.json` (every 13 MB trial).
Full local artifacts: `/private/tmp/ccstatusline-perf-4/`, including archived
source/build snapshots, benchmark raw latencies, CPU profiles, request/terminal
probe scripts, Linux ps output, and verification logs.

## Final checks and deliberate cuts

- `bun run build`: successful.
- Full `bun test`: **2361 passed, 0 failed**, 149 files, run once at the end.
- `bun run lint`: **clean**, run once at the end; no lint suppressions.
- Targeted editor/startup checks preceded that final full run. Built piped renders
  verified on Node and Bun; Node 14 full-dist execution is blocked as documented.
- Skipped incremental transcript caching: JSON parsing was ~9.7 ms self-time in
  PR profiles versus ~35.9 ms loader compilation, plus Yoga initialization.
  Cache correctness for append/partial records, truncation, rewrites, compaction,
  options and subagents needs a separate change, not a timeboxed add-on.
- Skipped ps fixes, build/dependency repair, production/minifier experiments,
  native BSD execution, real proxy-tunnel integration and additional TUI profiling.
  These findings/limitations remain explicit rather than silently broadening scope.
