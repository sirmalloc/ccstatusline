import argparse, concurrent.futures, hashlib, json, math, os, pathlib, platform, resource, shlex, shutil, signal, statistics, subprocess, sys, tempfile, time
# Set CCSTATUSLINE_BENCH_DIR to reuse a fixture across before/after invocations.
ROOT = pathlib.Path(os.environ.get('CCSTATUSLINE_BENCH_DIR') or tempfile.mkdtemp(prefix='ccstatusline-bench-')).resolve()
(ROOT / 'results').mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Legacy single-run mode (PR #397 before/after comparisons). Unchanged.
# ---------------------------------------------------------------------------

def setup():
    fixture = ROOT / 'transcript.jsonl'
    if not fixture.exists():
        with fixture.open('w') as f:
            for i in range(10000):
                row = {'type': 'assistant' if i % 2 else 'user', 'timestamp': '2026-09-25T01:%02d:%02dZ' % ((i // 60) % 60, i % 60), 'message': {'role': 'assistant' if i % 2 else 'user', 'content': [{'type':'text','text': 'x' * 1105}]}}
                if i % 2:
                    row['message'].update(id='msg-' + str(i), stop_reason='end_turn', usage={'input_tokens': 100, 'output_tokens': 50, 'cache_read_input_tokens': 200, 'cache_creation_input_tokens': 10})
                f.write(json.dumps(row, separators=(',', ':')) + '\n')
    return fixture

def environment(home, width=False):
    home.mkdir(parents=True, exist_ok=True)
    env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'USERPROFILE': str(home), 'CLAUDE_CONFIG_DIR': str(home / '.claude'), 'XDG_CONFIG_HOME': str(home / '.config'), 'XDG_CACHE_HOME': str(home / '.cache'), 'TERM': 'xterm-256color', 'LANG': 'en_US.UTF-8', 'TMPDIR': str(ROOT)}
    if width: env['CCSTATUSLINE_WIDTH'] = '120'
    return env

def payload(fixture):
    return json.dumps({'model': {'id': 'claude-sonnet-4-5', 'display_name': 'Sonnet 4.5'}, 'session_id': 'perf-synthetic', 'transcript_path': str(fixture), 'cwd': str(ROOT / 'empty-project'), 'workspace': {'current_dir': str(ROOT / 'empty-project')}})

def run(runtime, entry, label, width=False, rounds=20):
    entry = str(pathlib.Path(entry).resolve())
    fixture = setup()
    (ROOT / 'empty-project').mkdir(exist_ok=True)
    data = payload(fixture)
    homes = [ROOT / 'homes' / label / str(i) for i in range(4)]
    envs = [environment(h, width) for h in homes]
    def once(i, warm=False):
        start = time.perf_counter()
        p = subprocess.run([runtime, entry], input=data, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT / 'empty-project', env=envs[i])
        if p.returncode or (p.stderr and not warm): raise RuntimeError((p.returncode, p.stderr))
        return (time.perf_counter() - start)*1000, hashlib.sha256(p.stdout.encode()).hexdigest()
    for i in range(4): once(i, True)
    def worker(i): return [once(i) for _ in range(rounds)]
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        samples = sum(pool.map(worker, range(4)), [])
    wall = time.perf_counter() - start
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu = after.ru_utime + after.ru_stime - before.ru_utime - before.ru_stime
    latencies = sorted(s[0] for s in samples)
    result = {'label': label, 'runtime': runtime, 'entry': entry, 'bytes': fixture.stat().st_size, 'renders': len(samples), 'width_override': width, 'cpu_total_s': round(cpu,4), 'cpu_per_render_ms': round(cpu*1000/len(samples),3), 'wall_s': round(wall,3), 'p50_ms': round(statistics.median(latencies),3), 'p95_ms': round(latencies[int(len(latencies)*.95)-1],3), 'hashes': sorted(set(s[1] for s in samples)), 'latencies_ms': latencies}
    (ROOT/'results'/f'{label}.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({k:v for k,v in result.items() if k != 'latencies_ms'}), flush=True)

# ---------------------------------------------------------------------------
# N-session baseline harness (daemon epic, fork issue #14).
#
#   python3 scripts/benchmark-render.py baseline --runtime node --entry dist/ccstatusline.js --out <dir>
#
# One-shot baseline: every render is a fresh ccstatusline process, as Claude
# Code invokes it today. Each scenario runs in a dedicated child interpreter
# so getrusage(RUSAGE_CHILDREN) starts at zero and the CPU/RSS accounting
# covers that scenario only, including all reaped descendants (git etc.).
# ---------------------------------------------------------------------------

FIXTURE_ROWS = {'small': 500, 'large': 10000}
# Warm scenarios: steady state = persistent git cache (HOME/.cache/ccstatusline)
# and config already written by earlier renders. Cold: fresh HOME, the measured
# render is the session's first.
WARMUP_RENDERS, WARM_MEASURED = 2, 6
COUNT_WARMUP_RENDERS, COUNT_MEASURED = 1, 2
SHIM_BINS = {'git': '/usr/bin/git', 'security': '/usr/bin/security'}
LOAD_CHECK_INTERVAL_S = 10
CLIENT_SCRIPT = pathlib.Path(__file__).resolve().parent.parent / 'client' / 'ccstatusline-ipc'
SHARED_MODES = ('shared-cold', 'shared-warm', 'daemon-recovery')

# Slow-command scenario config: one custom-command widget sleeping 400ms per
# render (default timeout 1000ms applies). Written into the run HOME when
# --slow-config is passed; exercises per-render subprocess work beyond git.
SLOW_SETTINGS = {
    'version': 4,
    'lines': [[{'id': 'slow-cmd', 'type': 'custom-command', 'commandPath': 'sleep 0.4; echo slow-render'}]],
    'customCommandCacheTtlSeconds': 0,
}


def write_slow_config(home):
    config_dir = home / '.config' / 'ccstatusline'
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / 'settings.json').write_text(json.dumps(SLOW_SETTINGS))


def read_discovery(discovery_path):
    try:
        text = discovery_path.read_text()
    except OSError:
        return None
    info = {}
    for line in text.splitlines():
        if line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        info[key] = value
    if info.get('socket') and info.get('token'):
        return info
    return None


def daemon_health(info):
    try:
        out = subprocess.run(['curl', '-q', '-sS', '--fail', '--noproxy', '*', '--max-time', '5',
                              '--unix-socket', info['socket'],
                              '-H', 'Authorization: Bearer %s' % info['token'],
                              'http://localhost/v1/health'], capture_output=True, text=True)
    except subprocess.SubprocessError:
        return None
    if out.returncode:
        return None
    try:
        return json.loads(out.stdout)
    except ValueError:
        return None


def start_bench_daemon(runtime, entry, env, runtime_dir):
    # The daemon is a direct child of this scenario interpreter: reaping it at
    # the end folds its CPU into getrusage(RUSAGE_CHILDREN), so the aggregate
    # covers daemon + all client (sh+curl) processes.
    runtime_dir.mkdir(parents=True, exist_ok=True)
    daemon_env = dict(env, CCSTATUSLINE_RUNTIME_DIR=str(runtime_dir))
    started = time.perf_counter()
    proc = subprocess.Popen([runtime, entry, 'daemon'], env=daemon_env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    discovery = runtime_dir / 'daemon.env'
    deadline = time.time() + 15
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError('daemon exited during startup (rc=%s)' % proc.returncode)
        info = read_discovery(discovery)
        if info:
            health = daemon_health(info)
            if health:
                return proc, info, health, (time.perf_counter() - started) * 1000
        time.sleep(0.05)
    proc.terminate()
    proc.wait()
    raise RuntimeError('daemon not ready within 15s')


def stop_bench_daemon(proc):
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()

def machine_context():
    try:
        model = subprocess.run(['sysctl', '-n', 'machdep.cpu.brand_string'], capture_output=True, text=True).stdout.strip()
    except OSError:
        model = ''
    return {'cpu_model': model or platform.machine(), 'cpu_count': os.cpu_count(), 'os': platform.platform(), 'python': sys.version.split()[0]}

def loadavg1():
    return round(os.getloadavg()[0], 2)

def make_fixture(path, rows):
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w') as f:
        for i in range(rows):
            row = {'type': 'assistant' if i % 2 else 'user', 'timestamp': '2026-09-25T01:%02d:%02dZ' % ((i // 60) % 60, i % 60), 'message': {'role': 'assistant' if i % 2 else 'user', 'content': [{'type':'text','text': 'x' * 1105}]}}
            if i % 2:
                row['message'].update(id='msg-' + str(i), stop_reason='end_turn', usage={'input_tokens': 100, 'output_tokens': 50, 'cache_read_input_tokens': 200, 'cache_creation_input_tokens': 10})
            f.write(json.dumps(row, separators=(',', ':')) + '\n')
    return path

def setup_repo():
    # Shared dirty git repo: the default widget line (model, context-length,
    # git-branch, git-changes) spawns git on every render in a real project.
    repo = ROOT / 'bench-repo'
    if not (repo / '.git').exists():
        repo.mkdir(parents=True, exist_ok=True)
        def git(*a): subprocess.run(['git', *a], cwd=repo, check=True, capture_output=True)
        git('init')
        git('config', 'user.email', 'bench@local')
        git('config', 'user.name', 'bench')
        (repo / 'app.js').write_text('const x = 1;\n' * 50)
        (repo / 'README.md').write_text('# bench\n')
        git('add', '.')
        git('commit', '-m', 'init')
        (repo / 'app.js').write_text('const x = 2;\n' * 50)
        (repo / 'notes.txt').write_text('untracked\n')
    return repo

def make_shims(run_dir):
    # Count-pass only: PATH shims log one line per invocation, then exec the
    # real binary. Numbers from this pass (CPU/latency) are never reported as
    # baseline - only the counts are.
    shim_dir = run_dir / 'shims'
    shim_dir.mkdir(parents=True, exist_ok=True)
    made = []
    for name, real in SHIM_BINS.items():
        if not pathlib.Path(real).exists():
            continue
        count_file = run_dir / f'count-{name}.log'
        script = shim_dir / name
        script.write_text('#!/bin/sh\nprintf \'1\\n\' >> %s\nexec %s "$@"\n' % (shlex.quote(str(count_file)), shlex.quote(real)))
        script.chmod(0o755)
        made.append((name, count_file))
    return shim_dir, made

def read_count(path):
    try:
        return len(path.read_text().split())
    except FileNotFoundError:
        return 0

def pctl(sorted_xs, q):
    # Nearest-rank percentile; degrades to the single sample when n == 1.
    return sorted_xs[min(len(sorted_xs) - 1, max(0, math.ceil(q * len(sorted_xs)) - 1))]

def cmd_sampler(args):
    # Runs as a detached child; excluded from the scenario's CPU accounting by
    # reaping order (terminated after the post-measurement rusage snapshot).
    stop = {'flag': False}
    def onterm(signum, frame): stop['flag'] = True
    signal.signal(signal.SIGTERM, onterm)
    me = os.getpid()
    samples, seen = [], set()
    while not stop['flag']:
        try:
            out = subprocess.run(['ps', '-axo', 'pid=,ppid=,rss='], capture_output=True, text=True).stdout
            parent, rss = {}, {}
            for line in out.splitlines():
                parts = line.split()
                if len(parts) < 3:
                    continue
                try:
                    pid, ppid, mem = int(parts[0]), int(parts[1]), int(parts[2])
                except ValueError:
                    continue
                parent[pid], rss[pid] = ppid, mem
            children = {}
            for pid, pp in parent.items():
                children.setdefault(pp, []).append(pid)
            def descendants(root_pid):
                acc, stack = set(), [root_pid]
                while stack:
                    for child in children.get(stack.pop(), []):
                        if child not in acc:
                            acc.add(child)
                            stack.append(child)
                return acc
            # Live ccstatusline trees only: drop the sampler's own subtree and
            # the runner interpreter itself.
            live = descendants(args.target_pid) - descendants(me) - {me}
            samples.append(sum(rss.get(p, 0) for p in live))
            seen |= live
        except OSError:
            pass
        time.sleep(args.interval_ms / 1000.0)
    result = {'samples': len(samples), 'distinct_pids': len(seen)}
    if samples:
        result['aggregate_mean_kb'] = round(statistics.mean(samples), 1)
        result['aggregate_max_kb'] = max(samples)
    print(json.dumps(result), flush=True)

def cmd_run_one(args):
    shared = args.mode in SHARED_MODES
    label = 's%d-%s-%s%s%s' % (args.sessions, args.mode, args.transcript, '-counts' if args.count_pass else '', args.run_suffix)
    run_dir = ROOT / 'runs' / label
    if run_dir.exists():
        shutil.rmtree(run_dir)
    home = run_dir / 'home'
    home.mkdir(parents=True)
    fixture = make_fixture(ROOT / 'fixtures' / f'{args.transcript}.jsonl', FIXTURE_ROWS[args.transcript])
    repo = setup_repo()
    tx_dir = run_dir / 'tx'
    tx_dir.mkdir()
    payloads = []
    for i in range(args.sessions):
        session_tx = tx_dir / f's{i}.jsonl'
        try:
            os.link(fixture, session_tx)
        except OSError:
            shutil.copy(fixture, session_tx)
        payloads.append(json.dumps({'model': {'id': 'claude-sonnet-4-5', 'display_name': 'Sonnet 4.5'}, 'session_id': f'{label}-{i}', 'transcript_path': str(session_tx), 'cwd': str(repo), 'workspace': {'current_dir': str(repo)}}))
    # All sessions share one HOME per run: the daemon targets sessions of one
    # OS user, so persistent caches (git cache, settings) are shared like in
    # reality. Fresh HOME per run isolates cold from any earlier run's caches.
    env = environment(home, width=True)
    env['CCSL_FORK'] = '1'
    if args.slow_config:
        write_slow_config(home)
    shim_info = {'shims': [], 'counts_measured': {}}
    shims = []
    if args.count_pass and not shared:
        shim_dir, shims = make_shims(run_dir)
        env['PATH'] = str(shim_dir) + os.pathsep + env['PATH']
        shim_info['shims'] = [name for name, _ in shims]
    entry = str(pathlib.Path(args.entry).resolve())
    if args.mode == 'cold' or args.mode == 'shared-cold':
        warmups, measured = 0, 1
    elif args.mode == 'daemon-recovery':
        warmups, measured = 1, 1
    elif args.count_pass:
        warmups, measured = COUNT_WARMUP_RENDERS, COUNT_MEASURED
    else:
        warmups, measured = WARMUP_RENDERS, WARM_MEASURED
    first_stderr = ''
    # Short path on purpose: the daemon socket must fit sun_path (103 bytes on
    # macOS), and the run dir under the system temp dir can be deep.
    runtime_dir = pathlib.Path('/tmp') / ('ccsl-dbench-%d' % os.getpid())
    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)
    client_env = dict(env, CCSTATUSLINE_RUNTIME_DIR=str(runtime_dir))
    client_argv = ['/bin/sh', str(CLIENT_SCRIPT)]
    daemon = None
    daemon_info = None

    def start_daemon_now():
        nonlocal daemon, daemon_info
        daemon, daemon_info, health, startup_ms = start_bench_daemon(args.runtime, entry, env, runtime_dir)
        return health, startup_ms

    # Renders go either through a fresh one-shot process or through the shell
    # IPC client against the run's daemon. Returns (session, elapsed_ms, hash,
    # rc); rc != 0 means the client produced no status line (stdout empty).
    def once(i, allow_fail=False):
        nonlocal first_stderr
        start = time.perf_counter()
        if shared:
            p = subprocess.run(client_argv, input=payloads[i], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=repo, env=client_env, timeout=60)
        else:
            p = subprocess.run([args.runtime, entry], input=payloads[i], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=repo, env=env, timeout=60)
        elapsed = (time.perf_counter() - start) * 1000
        if p.returncode and not allow_fail:
            raise RuntimeError('render failed rc=%s stderr=%s' % (p.returncode, p.stderr[:500]))
        if p.stderr and not first_stderr:
            first_stderr = p.stderr[:500]
        return i, elapsed, hashlib.sha256(p.stdout.encode()).hexdigest(), p.returncode

    def wave(n, allow_fail=False):
        def worker(i):
            return [once(i, allow_fail) for _ in range(n)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.sessions) as pool:
            return sum(pool.map(worker, range(args.sessions)), [])

    daemon_startup_ms = None
    if shared and args.mode != 'shared-cold':
        _, daemon_startup_ms = start_daemon_now()
    for _ in range(warmups):
        wave(1)
    warmup_hashes = {}

    if args.mode == 'daemon-recovery':
        # Warm-wave hashes are the expected output; the kill must not change
        # any rendered line after recovery.
        for i, _elapsed, digest, rc in wave(1):
            if rc == 0:
                warmup_hashes.setdefault(i, digest)

    counts_before = {name: read_count(f) for name, f in shims} if args.count_pass else {}
    if args.max_load is not None:
        # Re-check inside the runner: the orchestrator gate ran seconds ago;
        # the measured phase must not land on a load spike.
        wait_for_load(args.max_load, 600)
    la_start = loadavg1()
    rbefore = resource.getrusage(resource.RUSAGE_CHILDREN)
    sampler = subprocess.Popen([sys.executable, __file__, '_sampler', '--target-pid', str(os.getpid()), '--interval-ms', str(args.interval_ms)], stdout=subprocess.PIPE, text=True)
    recovery = {}
    start = time.perf_counter()
    if args.mode == 'daemon-recovery':
        # Deterministic recovery proof: kill the daemon (SIGKILL, no cleanup),
        # then a full wave hits the dead daemon — every client must fail with
        # rc!=0 and EMPTY stdout (a partial line must never become a status
        # line). Restart, re-render every session, require byte-identical
        # output to the warm wave.
        assert daemon is not None
        daemon.kill()
        killed_at = time.perf_counter()
        daemon.wait()  # reap the killed daemon so its CPU stays in the run
        dead_samples = wave(1, allow_fail=True)
        survived = [s for s in dead_samples if s[3] == 0]
        failed = sorted({i for (i, _e, _h, rc) in dead_samples if rc != 0})
        empty_stdout = all(s[2] == hashlib.sha256(b'').hexdigest() for s in dead_samples if s[3] != 0)
        restart_started = time.perf_counter()
        _health, _ms = start_daemon_now()
        ready_at = time.perf_counter()
        reverified = {}
        for i in failed:
            _i, _e, digest, rc = once(i)
            if rc != 0:
                raise RuntimeError('recovery re-render failed for session %d' % i)
            reverified[i] = digest
        mismatched = [i for i, digest in reverified.items() if warmup_hashes.get(i) not in (None, digest)]
        recovery = {
            'clients_failed_on_dead_daemon': len(failed),
            'clients_that_still_succeeded': len(survived),
            'failed_clients_stdout_empty': empty_stdout,
            'restart_ready_ms': round((ready_at - restart_started) * 1000, 1),
            'reverified': len(reverified),
            'output_mismatches': mismatched,
        }
        samples = dead_samples
        wall = time.perf_counter() - start
    else:
        if args.mode == 'shared-cold':
            # Cold start: the measured wave includes booting the daemon from
            # nothing (no process, cold caches), like the first repaints after
            # a manual `daemon start`.
            _health, daemon_startup_ms = start_daemon_now()
        samples = wave(measured)
        wall = time.perf_counter() - start
    la_end = loadavg1()
    rafter = resource.getrusage(resource.RUSAGE_CHILDREN)
    sampler.terminate()
    try:
        rss = json.loads(sampler.communicate(timeout=15)[0] or '{}')
    except Exception:
        rss = {'samples': 0}
    counts_after = {name: read_count(f) for name, f in shims} if args.count_pass else {}
    if daemon is not None:
        # Health snapshot after the measured phase: aggregate counters
        # (dedup joins, failures), last render time, in-flight renders.
        health = daemon_health(daemon_info) if daemon_info else None
        daemon_snapshot = None
        if health:
            daemon_snapshot = {
                'counters': health.get('counters'),
                'uptime_s': health.get('uptimeSeconds'),
                'last_render_ms': health.get('lastRenderMs'),
                'active_renders': health.get('activeRenders'),
                'startup_ms': round(daemon_startup_ms, 1) if daemon_startup_ms is not None else None,
            }
        stop_bench_daemon(daemon)  # reap: CPU folds into RUSAGE_CHILDREN
        shutil.rmtree(runtime_dir, ignore_errors=True)
    else:
        daemon_snapshot = None
    latencies = sorted(s[1] for s in samples)
    cpu_user = rafter.ru_utime - rbefore.ru_utime
    cpu_sys = rafter.ru_stime - rbefore.ru_stime
    cpu_total = cpu_user + cpu_sys
    result = {
        'label': label, 'runtime': args.runtime, 'entry': entry,
        'sessions': args.sessions, 'mode': args.mode, 'transcript': args.transcript,
        'transcript_bytes': fixture.stat().st_size, 'count_pass': args.count_pass,
        'renders': len(samples), 'warmup_renders': warmups * args.sessions,
        'width_override': True, 'ccsl_fork': True,
        'slow_config': args.slow_config,
        'cpu_user_s': round(cpu_user, 4), 'cpu_sys_s': round(cpu_sys, 4), 'cpu_total_s': round(cpu_total, 4),
        'cpu_per_render_ms': round(cpu_total * 1000 / len(samples), 3),
        'cpu_s_per_wall_minute': round(cpu_total / wall * 60, 3),
        'renders_per_wall_minute': round(len(samples) / wall * 60, 1),
        'wall_s': round(wall, 3),
        # ru_maxrss of the largest reaped child tree (includes warmup children;
        # identical workload, so representative of one render's peak).
        'peak_rss_kb': rafter.ru_maxrss // 1024,
        'rss_sampling': rss,
        'latency_ms': {'n': len(latencies), 'mean': round(statistics.mean(latencies), 2), 'p50': round(pctl(latencies, 0.5), 2), 'p95': round(pctl(latencies, 0.95), 2), 'p99': round(pctl(latencies, 0.99), 2)},
        'latencies_ms': latencies,
        'output_hashes': sorted(set(s[2] for s in samples if s[3] == 0)),
        'distinct_output_hashes': len(set(s[2] for s in samples if s[3] == 0)),
        'spawn_counts_measured': {name: counts_after.get(name, 0) - counts_before.get(name, 0) for name in counts_after},
        'spawn_counts_per_render': {name: round((counts_after.get(name, 0) - counts_before.get(name, 0)) / len(samples), 2) for name in counts_after},
        'first_stderr': first_stderr,
        'loadavg_start': la_start, 'loadavg_end': la_end,
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
    }
    if shared:
        result['daemon'] = daemon_snapshot
        result['recovery'] = recovery or None
    shim_info['counts_measured'] = result['spawn_counts_measured']
    result['shims'] = shim_info
    (ROOT / 'results' / f'{label}.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k != 'latencies_ms'}), flush=True)

def wait_for_load(max_load, deadline_s):
    start = time.time()
    while True:
        la = loadavg1()
        if la <= max_load:
            return la
        if time.time() - start > deadline_s:
            raise TimeoutError('loadavg %.1f still above %.1f after %ss' % (la, max_load, deadline_s))
        print('[baseline] loadavg %.1f > %.1f, waiting %ds...' % (la, max_load, LOAD_CHECK_INTERVAL_S), flush=True)
        time.sleep(LOAD_CHECK_INTERVAL_S)

def run_scenario(env, args, sessions, mode, transcript, count_pass, suffix, slow=False, tag='daemon-bench'):
    label = 's%d-%s-%s%s%s' % (sessions, mode, transcript, '-counts' if count_pass else '', suffix)
    cmd = [sys.executable, str(pathlib.Path(__file__).resolve()), 'run-one',
           '--runtime', args.runtime, '--entry', args.entry,
           '--sessions', str(sessions), '--mode', mode, '--transcript', transcript,
           '--interval-ms', str(args.interval_ms)]
    if count_pass:
        cmd.append('--count-pass')
    if slow:
        cmd.append('--slow-config')
    if suffix:
        cmd.append('--run-suffix=%s' % suffix)
    if args.max_load is not None:
        cmd += ['--max-load', str(args.max_load)]
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=900)
    if proc.returncode:
        raise RuntimeError(proc.stderr.strip()[-800:])
    result = json.loads(proc.stdout.strip().splitlines()[-1])
    print('[%s] %-26s cpu/render=%sms cpu/wallmin=%ss peakRSS=%sMB aggRSS=%sMB p50=%sms p95=%sms p99=%sms hashes=%s%s' % (
        tag, label, result['cpu_per_render_ms'], result['cpu_s_per_wall_minute'],
        round(result['peak_rss_kb'] / 1024, 1),
        '%s→%s' % (round(result['rss_sampling'].get('aggregate_mean_kb', 0) / 1024, 1), round(result['rss_sampling'].get('aggregate_max_kb', 0) / 1024, 1)),
        result['latency_ms']['p50'], result['latency_ms']['p95'], result['latency_ms']['p99'],
        result.get('distinct_output_hashes'),
        (' daemon=%s' % result['daemon']['counters']) if result.get('daemon') and result['daemon'].get('counters') else ''), flush=True)
    return result


def cpu_reduction_pct(oneshot, shared):
    if not oneshot or not shared or oneshot.get('error') or shared.get('error'):
        return None
    base = oneshot['cpu_total_s']
    if base <= 0:
        return None
    return round((base - shared['cpu_total_s']) / base * 100, 1)


def cmd_daemon_bench(args):
    # One-shot vs shared-mode comparison for the daemon epic (#19): same
    # fixtures, same wave pattern; the shared run's aggregate CPU covers the
    # daemon plus every client (sh+curl) because both are reaped children of
    # the scenario interpreter.
    out_dir = pathlib.Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    fixture_root = out_dir / 'fixture-root'
    fixture_root.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['CCSTATUSLINE_BENCH_DIR'] = str(fixture_root)
    max_load = args.max_load if args.max_load is not None else (os.cpu_count() or 4) / 2
    sessions = [int(s) for s in args.sessions.split(',')]
    big = max(sessions)
    la_start = wait_for_load(max_load, args.load_wait_sec)

    plan = []  # (kind, sessions, mode, transcript, suffix)
    for n in sessions:
        plan += [
            ('one-shot', n, 'cold', 'small', ''),
            ('one-shot', n, 'warm', 'small', ''),
            ('shared', n, 'shared-cold', 'small', ''),
            ('shared', n, 'shared-warm', 'small', ''),
        ]
    plan += [
        ('one-shot', big, 'warm', 'large', '-large'),
        ('shared', big, 'shared-warm', 'large', '-large'),
        ('one-shot', big, 'warm', 'small', '-slow'),
        ('shared', big, 'shared-warm', 'small', '-slow'),
        ('recovery', big, 'daemon-recovery', 'small', ''),
    ]

    runs = []
    for kind, n, mode, transcript, suffix in plan:
        try:
            wait_for_load(max_load, args.load_wait_sec)
            if kind == 'recovery':
                runs.append(run_scenario(env, args, n, mode, transcript, False, suffix))
            else:
                slow = suffix == '-slow'
                runs.append(run_scenario(env, args, n, mode, transcript, False, suffix, slow=slow))
        except Exception as e:
            print('[daemon-bench] FAILED s%d-%s-%s%s: %s' % (n, mode, transcript, suffix, e), flush=True)
            runs.append({'label': 's%d-%s-%s%s' % (n, mode, transcript, suffix), 'mode': mode, 'kind': kind, 'error': str(e)})

    def find(label):
        for r in runs:
            if r['label'] == label:
                return r
        return None

    # Pairwise comparison: output equality and aggregate CPU.
    pair_specs = []
    for n in sessions:
        pair_specs += [(n, 'cold', 'small', ''), (n, 'warm', 'small', '')]
    pair_specs += [(big, 'warm', 'large', '-large'), (big, 'warm', 'small', '-slow')]
    comparisons = []
    for n, phase, transcript, suffix in pair_specs:
        one = find('s%d-%s-%s%s' % (n, phase, transcript, suffix))
        shared = find('s%d-shared-%s-%s%s' % (n, phase, transcript, suffix))
        comparisons.append({
            'sessions': n, 'workload': transcript, 'phase': phase,
            'oneshot_label': one and one.get('label'), 'shared_label': shared and shared.get('label'),
            'oneshot_cpu_total_s': one and one.get('cpu_total_s'), 'shared_cpu_total_s': shared and shared.get('cpu_total_s'),
            'oneshot_agg_rss_max_kb': one and one.get('rss_sampling', {}).get('aggregate_max_kb'),
            'shared_agg_rss_max_kb': shared and shared.get('rss_sampling', {}).get('aggregate_max_kb'),
            'oneshot_p95_ms': one and one.get('latency_ms', {}).get('p95'),
            'shared_p95_ms': shared and shared.get('latency_ms', {}).get('p95'),
            'output_hashes_equal': (one is not None and shared is not None and not one.get('error') and not shared.get('error')
                                    and sorted(one.get('output_hashes', [])) == sorted(shared.get('output_hashes', []))),
            'cpu_reduction_pct': cpu_reduction_pct(one, shared),
        })
    # The epic's gate is defined on the warmed 36-session workload; fall back
    # to the largest configured session count only when 36 was not measured.
    gate_n = 36 if 36 in sessions else big
    gate_one = find('s%d-warm-small' % gate_n)
    gate_shared = find('s%d-shared-warm-small' % gate_n)
    gate = {
        'scenario': 's%d-warm-small (warmed %d-session workload)' % (gate_n, gate_n),
        'target': '>=50% aggregate-CPU reduction, shared vs one-shot, daemon and clients included',
        'oneshot_cpu_total_s': gate_one and gate_one.get('cpu_total_s'),
        'shared_cpu_total_s': gate_shared and gate_shared.get('cpu_total_s'),
        'reduction_pct': cpu_reduction_pct(gate_one, gate_shared),
        'passed': (cpu_reduction_pct(gate_one, gate_shared) or -999) >= 50,
    }
    recovery = find('s%d-daemon-recovery-small' % big)
    # The recovery scenario is a proof, not telemetry: its invariants gate the
    # run like any other acceptance check. clients_that_still_succeeded > 0 or
    # a non-empty stdout on the dead-daemon wave means the isolation contract
    # is broken; any output mismatch after restart means rendering changed.
    recovery_gate = {
        'target': 'every client fails clean (rc!=0, empty stdout) against the dead daemon; all sessions re-render byte-identically after restart',
        'clients_that_still_succeeded': recovery.get('recovery', {}).get('clients_that_still_succeeded') if recovery else None,
        'failed_clients_stdout_empty': recovery.get('recovery', {}).get('failed_clients_stdout_empty') if recovery else None,
        'output_mismatches': recovery.get('recovery', {}).get('output_mismatches') if recovery else None,
    }
    recovery_gate['passed'] = bool(
        recovery and not recovery.get('error')
        and recovery_gate['clients_that_still_succeeded'] == 0
        and recovery_gate['failed_clients_stdout_empty'] is True
        and recovery_gate['output_mismatches'] == []
    )

    meta = {
        'runtime': args.runtime, 'entry': str(pathlib.Path(args.entry).resolve()), 'ccsl_fork': True,
        'machine': machine_context(), 'generated': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'loadavg_start': la_start, 'loadavg_end': loadavg1(), 'max_load_gate': max_load,
        'notes': [
            'Measured numbers only; no extrapolation.',
            'Shared-mode aggregate CPU covers the daemon AND every client process (sh + curl): both are reaped children of the scenario interpreter, accounted via getrusage(RUSAGE_CHILDREN).',
            'Cold shared mode includes booting the daemon (no process, cold caches) inside the measured window.',
            'Idle-timer refreshes are not modeled as a separate phase; warm runs measure steady back-to-back repaint waves, and the daemon idle sweep runs only after 5 quiet minutes.',
            'Slow-command scenario: one custom-command widget sleeping 400ms per render, cache TTL 0.',
            'Recovery scenario: SIGKILL of the daemon (no cleanup), a full client wave against the dead daemon must fail with rc!=0 and empty stdout (never a partial line), then the daemon is restarted and every session re-rendered with byte-identical output.',
            'Aggregate RSS is sampled via ps over live process trees (~%sms cadence); short-lived children can be missed, so it undercounts.' % args.interval_ms,
            'Runs were rejected/waited while system loadavg1 exceeded %s (gate recorded above); concurrent sibling sessions still add noise.' % max_load,
        ],
    }
    doc = {'meta': meta, 'runs': runs, 'comparisons': comparisons, 'gate': gate, 'recovery': recovery, 'recovery_gate': recovery_gate}
    (out_dir / 'daemon-bench.json').write_text(json.dumps(doc, indent=2))
    write_daemon_summary(out_dir, doc)
    failed = sum(1 for r in runs if r.get('error')) + (0 if recovery_gate['passed'] else 1)
    print('[daemon-bench] recovery gate: passed=%s (still_succeeded=%s, stdout_empty=%s, mismatches=%s)' % (
        recovery_gate['passed'], recovery_gate['clients_that_still_succeeded'],
        recovery_gate['failed_clients_stdout_empty'], recovery_gate['output_mismatches']), flush=True)
    print('[daemon-bench] done: %d runs, %d failed. Gate (%s): %s%% reduction, passed=%s. Results: %s/daemon-bench.json, %s/DAEMON-BENCH.md' % (
        len(runs), failed, gate['scenario'], gate['reduction_pct'], gate['passed'], out_dir, out_dir), flush=True)
    return 1 if failed or not gate['passed'] else 0


def write_daemon_summary(out_dir, doc):
    meta, comparisons, gate, recovery = doc['meta'], doc['comparisons'], doc['gate'], doc['recovery']
    lines = ['# ccstatusline daemon vs one-shot (issue #19)', '',
             'One-shot vs shared-mode (daemon) aggregate cost. Shared numbers cover the',
             'daemon plus every client process; one-shot covers the fresh process per',
             'render and its children (git etc.).', '',
             '- runtime: `%s %s`' % (meta['runtime'], meta['entry']),
             '- machine: %s, %s cores, %s' % (meta['machine']['cpu_model'], meta['machine']['cpu_count'], meta['machine']['os']),
             '- generated: %s, loadavg before/after: %s/%s' % (meta['generated'], meta['loadavg_start'], meta['loadavg_end']), '']

    lines.append('## Per-scenario aggregate cost')
    lines.append('')
    lines.append('| scenario | renders | CPU s total | CPU s/render | CPU s/wall-min | agg RSS MB mean→max | p50 ms | p95 ms | p99 ms | distinct hashes |')
    lines.append('|---|---|---|---|---|---|---|---|---|---|')
    for r in doc['runs']:
        if r.get('error'):
            lines.append('| %s | FAILED | %s |' % (r['label'], r['error'][:120].replace('\n', ' ').replace('|', '\\|')))
            continue
        lat = r['latency_ms']
        lines.append('| %s | %d | %s | %s | %s | %s→%s | %s | %s | %s | %s |' % (
            r['label'], r['renders'], r['cpu_total_s'], r['cpu_per_render_ms'], r['cpu_s_per_wall_minute'],
            fmt_mb(r['rss_sampling'].get('aggregate_mean_kb', 0)), fmt_mb(r['rss_sampling'].get('aggregate_max_kb', 0)),
            lat['p50'], lat['p95'], lat['p99'], r.get('distinct_output_hashes')))
    lines.append('')

    lines.append('## One-shot vs shared comparison')
    lines.append('')
    lines.append('| sessions | workload | phase | one-shot CPU s | shared CPU s | reduction | hashes equal |')
    lines.append('|---|---|---|---|---|---|---|')
    for c in comparisons:
        lines.append('| %s | %s | %s | %s | %s | %s%% | %s |' % (
            c['sessions'], c['workload'], c['phase'], c['oneshot_cpu_total_s'], c['shared_cpu_total_s'],
            c['cpu_reduction_pct'], c['output_hashes_equal']))
    lines.append('')

    lines.append('## Acceptance gate')
    lines.append('')
    lines.append('- scenario: %s' % gate['scenario'])
    lines.append('- target: %s' % gate['target'])
    lines.append('- measured: one-shot %s s CPU, shared %s s CPU → %s%% reduction' % (gate['oneshot_cpu_total_s'], gate['shared_cpu_total_s'], gate['reduction_pct']))
    lines.append('- result: %s (measured, not assumed)' % ('PASS' if gate['passed'] else 'FAIL'))
    lines.append('')

    if recovery:
        rec = recovery.get('recovery') or {}
        lines.append('## Recovery (SIGKILL, dead-daemon wave, restart)')
        lines.append('')
        lines.append('- clients that failed on the dead daemon with rc!=0: %s of %s' % (rec.get('clients_failed_on_dead_daemon'), recovery.get('sessions')))
        lines.append('- clients that still succeeded (should be 0): %s' % rec.get('clients_that_still_succeeded'))
        lines.append('- failed clients left stdout empty (no partial status line): %s' % rec.get('failed_clients_stdout_empty'))
        lines.append('- daemon restart to ready: %s ms' % rec.get('restart_ready_ms'))
        lines.append('- sessions re-rendered after restart: %s, output mismatches vs warm wave: %s' % (rec.get('reverified'), rec.get('output_mismatches')))
        lines.append('- gate: %s (violations fail the whole run)' % ('PASS' if doc.get('recovery_gate', {}).get('passed') else 'FAIL'))
        lines.append('')

    lines.append('## Notes and honesty')
    lines.append('')
    for note in meta['notes']:
        lines.append('- %s' % note)
    (out_dir / 'DAEMON-BENCH.md').write_text('\n'.join(lines) + '\n')

def fmt_mb(kb):
    return round(kb / 1024, 1)

def write_summary(out_dir, meta, runs):
    lines = ['# ccstatusline one-shot baseline (N sessions)', '',
             'Baseline reference for daemon epic axisrow/ccstatusline#14: what the',
             'current per-invocation model costs today. The daemon red line is',
             'aggregate CPU and RSS not above these numbers.', '',
             '- runtime: `%s %s`%s' % (meta['runtime'], meta['entry'], ', CCSL_FORK=1' if meta.get('ccsl_fork') else ''),
             '- machine: %s, %s cores, %s' % (meta['machine']['cpu_model'], meta['machine']['cpu_count'], meta['machine']['os']),
             '- generated: %s, loadavg before/after: %s/%s' % (meta['generated'], meta['loadavg_start'], meta['loadavg_end']),
             '- spawn counts come from separate instrumented passes (PATH shims);',
             '  their CPU/latency numbers are excluded from this report.', '']

    def table(rows, show_counts):
        header = '| scenario | renders | CPU s/render | CPU s/wall-min | peak RSS MB | agg RSS MB mean→max | p50 ms | p95 ms | p99 ms |'
        if show_counts:
            header += ' git/render |'
        lines.append(header)
        lines.append('|' + '---|' * (10 if show_counts else 9))
        for r in rows:
            lat = r['latency_ms']
            counts = r.get('spawn_counts_per_render', {})
            row = '| %s | %d | %s | %s | %s | %s→%s | %s | %s | %s |' % (
                r['label'], r['renders'], r['cpu_per_render_ms'], r['cpu_s_per_wall_minute'],
                fmt_mb(r['peak_rss_kb']),
                fmt_mb(r['rss_sampling'].get('aggregate_mean_kb', 0)), fmt_mb(r['rss_sampling'].get('aggregate_max_kb', 0)),
                lat['p50'], lat['p95'], lat['p99'])
            if show_counts:
                row += ' %s |' % counts.get('git', 'n/a')
            lines.append(row)
        lines.append('')

    for mode in ('cold', 'warm'):
        rows = [r for r in runs if r['mode'] == mode and not r['count_pass'] and not r['label'].endswith(('r2', 'r3'))]
        if rows:
            lines.append('## %s (fresh HOME, first render per session)' % mode if mode == 'cold' else '## %s (%d warmup renders, then measured)' % (mode, WARMUP_RENDERS))
            lines.append('')
            table(rows, show_counts=False)

    count_rows = [r for r in runs if r['count_pass']]
    if count_rows:
        lines.append('## Spawn counts (instrumented passes)')
        lines.append('')
        lines.append('| scenario | git/render | security/render |')
        lines.append('|---|---|---|')
        for r in count_rows:
            c = r['spawn_counts_per_render']
            lines.append('| %s | %s | %s |' % (r['label'], c.get('git', 'n/a'), c.get('security', 'n/a')))
        lines.append('')

    repeats = [r for r in runs if r['label'].endswith(('r2', 'r3'))]
    base = [r for r in runs if r['label'] == 's36-warm-small' and not r['count_pass']]
    if base and repeats:
        lines.append('## Run-to-run variance (%s, repeated)' % base[0]['label'])
        lines.append('')
        lines.append('| run | CPU s/render | CPU s/wall-min | agg RSS MB max | p95 ms |')
        lines.append('|---|---|---|---|---|')
        for r in base + repeats:
            lines.append('| %s | %s | %s | %s | %s |' % (r['label'], r['cpu_per_render_ms'], r['cpu_s_per_wall_minute'], fmt_mb(r['rss_sampling'].get('aggregate_max_kb', 0)), r['latency_ms']['p95']))
        lines.append('')

    failures = [r for r in runs if r.get('error')]
    if failures:
        lines.append('## Failed scenarios')
        lines.append('')
        for r in failures:
            lines.append('- %s: %s' % (r['label'], r['error'][:300]))
        lines.append('')
    lines.append('## Noise and honesty notes')
    lines.append('')
    for note in meta['notes']:
        lines.append('- %s' % note)
    (out_dir / 'BASELINE.md').write_text('\n'.join(lines) + '\n')

def cmd_baseline(args):
    out_dir = pathlib.Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    fixture_root = out_dir / 'fixture-root'
    fixture_root.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['CCSTATUSLINE_BENCH_DIR'] = str(fixture_root)
    max_load = args.max_load if args.max_load is not None else (os.cpu_count() or 4) / 2
    sessions = [int(s) for s in args.sessions.split(',')]
    transcripts = args.transcripts.split(',')
    la_start = wait_for_load(max_load, args.load_wait_sec)
    runs = []
    plan = []
    for s in sessions:
        for mode in ('cold', 'warm'):
            for t in transcripts:
                plan.append((s, mode, t, False, ''))
                plan.append((s, mode, t, True, ''))
    for extra in range(2, args.repeat + 1):
        plan.append((36, 'warm', 'small', False, '-r%d' % extra))
    for s, mode, t, count_pass, suffix in plan:
        try:
            wait_for_load(max_load, args.load_wait_sec)
            runs.append(run_scenario(env, args, s, mode, t, count_pass, suffix))
        except Exception as e:
            print('[baseline] FAILED s%d-%s-%s%s: %s' % (s, mode, t, suffix, e), flush=True)
            runs.append({'label': 's%d-%s-%s%s%s' % (s, mode, t, '-counts' if count_pass else '', suffix), 'mode': mode, 'count_pass': count_pass, 'error': str(e)})
    meta = {
        'runtime': args.runtime, 'entry': str(pathlib.Path(args.entry).resolve()), 'ccsl_fork': True,
        'machine': machine_context(), 'generated': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'loadavg_start': la_start, 'loadavg_end': loadavg1(), 'max_load_gate': max_load,
        'warmup_renders': WARMUP_RENDERS, 'warm_measured': WARM_MEASURED,
        'notes': [
            'Measured numbers only; no extrapolation from fewer sessions.',
            'Every render is a fresh ccstatusline process (one-shot mode as Claude Code invokes it today).',
            'CPU accounting covers user+sys of all reaped descendants (runtime + git + sh) via getrusage(RUSAGE_CHILDREN) in a dedicated interpreter per scenario.',
            'Aggregate RSS is sampled via ps over live process trees (~%sms cadence); short-lived git children can be missed, so it undercounts.' % args.interval_ms,
            'peak RSS is getrusage ru_maxrss of the largest reaped child tree; for warm runs it includes warmup children (identical workload).',
            'Spawn counts are from separate instrumented passes with PATH shims (git, security); shim overhead excludes their CPU/latency from baseline tables. Spawns via absolute paths (e.g. runtime self-spawn for git review refresh) are not shim-visible; the synthetic repo has no origin remote, so review-cache refresh does not trigger.',
            'macOS page cache is not purged; cold means fresh HOME and first render, not cold disk.',
            'Shared dirty git repo as cwd; all sessions share one HOME per run (same-OS-user realism); each session has its own transcript file.',
            'Runs were rejected/waited while system loadavg1 exceeded %s (gate recorded above); concurrent sibling sessions still add noise.' % max_load,
            'The harness sampler (ps loop) adds a small constant measurement overhead, identical across scenarios.',
        ],
    }
    (out_dir / 'baseline.json').write_text(json.dumps({'meta': meta, 'runs': runs}, indent=2))
    write_summary(out_dir, meta, runs)
    failed = sum(1 for r in runs if r.get('error'))
    print('[baseline] done: %d runs, %d failed. Results: %s/baseline.json, %s/BASELINE.md' % (len(runs), failed, out_dir, out_dir), flush=True)
    return 1 if failed else 0

def cmd_self_test():
    assert pctl([5.0], 0.5) == 5.0
    xs = sorted(range(1, 101))
    assert pctl(xs, 0.5) == 50 and pctl(xs, 0.99) == 99 and pctl(xs, 0.95) == 95
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='ccsl-bench-selftest-'))
    fixture = make_fixture(tmp / 'small.jsonl', FIXTURE_ROWS['small'])
    lines = fixture.read_text().splitlines()
    assert len(lines) == 500 and json.loads(lines[0])['type'] == 'user'
    shim_dir, shims = make_shims(tmp)
    assert ('git', tmp / 'count-git.log') in shims
    env = dict(os.environ, PATH=str(shim_dir) + os.pathsep + os.environ['PATH'], HOME=str(tmp))
    subprocess.run(['git', '--version'], env=env, check=True, capture_output=True)
    subprocess.run(['git', '--version'], env=env, check=True, capture_output=True)
    assert read_count(tmp / 'count-git.log') == 2, read_count(tmp / 'count-git.log')
    shutil.rmtree(tmp)
    print('self-test PASS')
    return 0

def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'baseline':
        p = argparse.ArgumentParser(prog='benchmark-render.py baseline')
        p.add_argument('--runtime', required=True)
        p.add_argument('--entry', required=True)
        p.add_argument('--out', required=True)
        p.add_argument('--sessions', default='1,10,36')
        p.add_argument('--transcripts', default='small,large')
        p.add_argument('--repeat', type=int, default=3, help='total runs of the variance scenario s36-warm-small (default 3)')
        p.add_argument('--max-load', type=float, default=None, help='loadavg1 gate, default cpu_count/2')
        p.add_argument('--load-wait-sec', type=int, default=1800)
        p.add_argument('--interval-ms', type=int, default=25)
        args = p.parse_args(sys.argv[2:])
        sys.exit(cmd_baseline(args))
    if len(sys.argv) > 1 and sys.argv[1] == 'daemon-bench':
        p = argparse.ArgumentParser(prog='benchmark-render.py daemon-bench')
        p.add_argument('--runtime', required=True)
        p.add_argument('--entry', required=True)
        p.add_argument('--out', required=True)
        p.add_argument('--sessions', default='1,10,36,50')
        p.add_argument('--max-load', type=float, default=None, help='loadavg1 gate, default cpu_count/2')
        p.add_argument('--load-wait-sec', type=int, default=1800)
        p.add_argument('--interval-ms', type=int, default=25)
        args = p.parse_args(sys.argv[2:])
        sys.exit(cmd_daemon_bench(args))
    if len(sys.argv) > 1 and sys.argv[1] == 'run-one':
        p = argparse.ArgumentParser(prog='benchmark-render.py run-one')
        p.add_argument('--runtime', required=True)
        p.add_argument('--entry', required=True)
        p.add_argument('--sessions', type=int, required=True)
        p.add_argument('--mode', choices=['cold', 'warm', 'shared-cold', 'shared-warm', 'daemon-recovery'], required=True)
        p.add_argument('--transcript', choices=sorted(FIXTURE_ROWS), required=True)
        p.add_argument('--count-pass', action='store_true')
        p.add_argument('--slow-config', action='store_true')
        p.add_argument('--run-suffix', default='')
        p.add_argument('--interval-ms', type=int, default=25)
        p.add_argument('--max-load', type=float, default=None)
        args = p.parse_args(sys.argv[2:])
        cmd_run_one(args)
        return
    if len(sys.argv) > 1 and sys.argv[1] == '_sampler':
        p = argparse.ArgumentParser(prog='benchmark-render.py _sampler')
        p.add_argument('--target-pid', type=int, required=True)
        p.add_argument('--interval-ms', type=int, default=25)
        args = p.parse_args(sys.argv[2:])
        cmd_sampler(args)
        return
    if len(sys.argv) > 1 and sys.argv[1] == '--self-test':
        sys.exit(cmd_self_test())
    if len(sys.argv) > 3:
        run(sys.argv[1], sys.argv[2], sys.argv[3], '--width' in sys.argv)
        return
    print('usage: benchmark-render.py <runtime> <entry> <label> [--width]  (legacy #397)\n'
          '       benchmark-render.py baseline --runtime R --entry E --out DIR [--sessions 1,10,36]\n'
          '       benchmark-render.py daemon-bench --runtime R --entry E --out DIR [--sessions 1,10,36,50]\n'
          '       benchmark-render.py --self-test')

if __name__ == '__main__':
    main()
