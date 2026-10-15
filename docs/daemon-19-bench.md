# ccstatusline daemon vs one-shot (issue #19)

One-shot vs shared-mode (daemon) aggregate cost. Shared numbers cover the
daemon plus every client process; one-shot covers the fresh process per
render and its children (git etc.).

- runtime: `node /Users/axisrow/.ao/data/worktrees/ccstatusline/ccstatusline-24/dist/ccstatusline.js`
- machine: Apple M5, 10 cores, macOS-26.6.2-arm64-arm-64bit
- generated: 2026-09-30T10:57:23+0800, loadavg before/after: 5.5/9.48

## Per-scenario aggregate cost

| scenario | renders | CPU s total | CPU s/render | CPU s/wall-min | agg RSS MB mean→max | p50 ms | p95 ms | p99 ms | distinct hashes |
|---|---|---|---|---|---|---|---|---|---|
| s1-cold-small | 1 | 0.1756 | 175.63 | 61.647 | 64.7→76.4 | 168.76 | 168.76 | 168.76 | 1 |
| s1-warm-small | 6 | 0.7083 | 118.056 | 67.174 | 46.9→74.3 | 105.72 | 107.64 | 107.64 | 1 |
| s1-shared-cold-small | 1 | 0.0254 | 25.377 | 6.582 | 78.2→93.5 | 54.79 | 54.79 | 54.79 | 1 |
| s1-shared-warm-small | 6 | 0.1016 | 16.93 | 40.546 | 94.9→99.2 | 24.52 | 26.74 | 26.74 | 1 |
| s10-cold-small | 10 | 1.7948 | 179.475 | 333.198 | 532.5→740.9 | 303.36 | 315.93 | 315.93 | 1 |
| s10-warm-small | 60 | 10.2056 | 170.093 | 355.471 | 490.5→705.5 | 256.02 | 369.35 | 524.54 | 1 |
| s10-shared-cold-small | 10 | 0.3061 | 30.612 | 59.12 | 98.5→169.0 | 120.54 | 129.49 | 129.49 | 1 |
| s10-shared-warm-small | 60 | 1.6332 | 27.22 | 149.85 | 146.0→179.2 | 99.99 | 179.47 | 199.07 | 1 |
| s36-cold-small | 36 | 6.6432 | 184.534 | 350.976 | 1922.7→2505.6 | 986.18 | 1103.96 | 1106.16 | 1 |
| s36-warm-small | 216 | 38.8789 | 179.995 | 372.811 | 1995.4→2352.8 | 1007.73 | 1346.83 | 1448.1 | 1 |
| s36-shared-cold-small | 36 | 1.4178 | 39.383 | 146.92 | 153.8→297.3 | 268.14 | 335.71 | 404.66 | 1 |
| s36-shared-warm-small | 216 | 7.5039 | 34.74 | 247.352 | 282.3→388.7 | 229.21 | 682.07 | 845.38 | 1 |
| s50-cold-small | 50 | 9.1324 | 182.647 | 380.071 | 2060.4→2783.0 | 1091.7 | 1298.33 | 1327.7 | 1 |
| s50-warm-small | 300 | 53.6651 | 178.884 | 429.075 | 2774.7→3462.9 | 1218.47 | 1486.33 | 1586.27 | 1 |
| s50-shared-cold-small | 50 | 2.084 | 41.68 | 163.71 | 198.9→444.8 | 288.46 | 515.01 | 523.16 | 1 |
| s50-shared-warm-small | 300 | 11.2553 | 37.518 | 260.539 | 346.0→555.5 | 279.78 | 784.97 | 1483.55 | 1 |
| s50-warm-large-large | 300 | 64.7237 | 215.746 | 413.895 | 3060.1→3922.5 | 1526.73 | 1872.9 | 2092.51 | 1 |
| s50-shared-warm-large-large | 300 | 14.0298 | 46.766 | 159.901 | 454.5→634.3 | 362.11 | 2272.7 | 3896.3 | 1 |
| s50-warm-small-slow | 300 | 75.1512 | 250.504 | 355.694 | 3881.9→5754.0 | 1969.11 | 2636.41 | 2755.31 | 1 |
| s50-shared-warm-small-slow | FAILED | ` for _ in range(n)] ^^^^^^^^^^^^^^^^^^^ File "/Users/axisrow/.ao/data/worktrees/ccstatusline/ccstatusline-` |
| s50-daemon-recovery-small | 50 | 2.9105 | 58.211 | 94.664 | 101.9→116.0 | 108.77 | 138.34 | 161.21 | 0 |

## One-shot vs shared comparison

| sessions | workload | phase | one-shot CPU s | shared CPU s | reduction | hashes equal |
|---|---|---|---|---|---|---|
| 1 | small | cold | 0.1756 | 0.0254 | 85.5% | True |
| 1 | small | warm | 0.7083 | 0.1016 | 85.7% | True |
| 10 | small | cold | 1.7948 | 0.3061 | 82.9% | True |
| 10 | small | warm | 10.2056 | 1.6332 | 84.0% | True |
| 36 | small | cold | 6.6432 | 1.4178 | 78.7% | True |
| 36 | small | warm | 38.8789 | 7.5039 | 80.7% | True |
| 50 | small | cold | 9.1324 | 2.084 | 77.2% | True |
| 50 | small | warm | 53.6651 | 11.2553 | 79.0% | True |
| 50 | large | warm | 64.7237 | 14.0298 | 78.3% | True |
| 50 | small | warm | 75.1512 | None | None% | False |

## Acceptance gate

- scenario: s36-warm-small (warmed 36-session workload)
- target: >=50% aggregate-CPU reduction, shared vs one-shot, daemon and clients included
- measured: one-shot 38.8789 s CPU, shared 7.5039 s CPU → 80.7% reduction
- result: PASS (measured, not assumed)

## Recovery (SIGKILL, dead-daemon wave, restart)

- clients that failed on the dead daemon with rc!=0: 50 of 50
- clients that still succeeded (should be 0): 0
- failed clients left stdout empty (no partial status line): True
- daemon restart to ready: 135.5 ms
- sessions re-rendered after restart: 50, output mismatches vs warm wave: []
- gate: PASS (violations fail the whole run)

## Notes and honesty

- Measured numbers only; no extrapolation.
- Shared-mode aggregate CPU covers the daemon AND every client process (sh + curl): both are reaped children of the scenario interpreter, accounted via getrusage(RUSAGE_CHILDREN).
- Cold shared mode includes booting the daemon (no process, cold caches) inside the measured window.
- Idle-timer refreshes are not modeled as a separate phase; warm runs measure steady back-to-back repaint waves, and the daemon idle sweep runs only after 5 quiet minutes.
- Slow-command scenario: one custom-command widget sleeping 400ms per render, cache TTL 0.
- Recovery scenario: SIGKILL of the daemon (no cleanup), a full client wave against the dead daemon must fail with rc!=0 and empty stdout (never a partial line), then the daemon is restarted and every session re-rendered with byte-identical output.
- Aggregate RSS is sampled via ps over live process trees (~25ms cadence); short-lived children can be missed, so it undercounts.
- Runs were rejected/waited while system loadavg1 exceeded 14.0 (gate recorded above); concurrent sibling sessions still add noise.
