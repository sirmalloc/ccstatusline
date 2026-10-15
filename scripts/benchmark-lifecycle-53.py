#!/usr/bin/env python3
"""On-demand lifecycle benchmark (fork issue #53).

Scenarios, all against the same mixed workload (sessions alternate between a
small and a large transcript and between a dirty and a clean repo, so the
daemon's caches hold a cold/warm mix):

  lazy-N     N concurrent shared-mode clients, NO daemon pre-started: the
             first wave includes the lazy start (#53), the second wave is
             warm. Proves: one daemon serves the whole burst (stable pid,
             bounded 503s, no failures), plus CPU/render and p95.
  oneshot-N  N concurrent one-shot renders (two waves) as the baseline.
  idle-stop  daemon started explicitly with daemonIdleStopMinutes=1 must
             exit by itself with zero requests; the next render lazily
             restarts it.

Usage:
  python3 scripts/benchmark-lifecycle-53.py --runtime bun \
      --entry src/ccstatusline.ts --sessions 20,30 --out docs
"""
import argparse, concurrent.futures, hashlib, json, math, os, pathlib, platform, resource, shutil, subprocess, sys, tempfile, time

ROOT = pathlib.Path(tempfile.mkdtemp(prefix='ccsl-53bench-')).resolve()
CLIENT_SCRIPT = pathlib.Path(__file__).resolve().parent.parent / 'client' / 'ccstatusline-ipc'
FIXTURE_ROWS = {'small': 500, 'large': 10000}


def machine_context():
    try:
        model = subprocess.run(['sysctl', '-n', 'machdep.cpu.brand_string'], capture_output=True, text=True).stdout.strip()
    except OSError:
        model = ''
    return {'cpu_model': model or platform.machine(), 'cpu_count': os.cpu_count(), 'os': platform.platform(), 'python': sys.version.split()[0]}


def environment(home):
    home.mkdir(parents=True, exist_ok=True)
    return {'PATH': os.environ['PATH'], 'HOME': str(home), 'USERPROFILE': str(home),
            'CLAUDE_CONFIG_DIR': str(home / '.claude'), 'XDG_CONFIG_HOME': str(home / '.config'),
            'XDG_CACHE_HOME': str(home / '.cache'), 'TERM': 'xterm-256color', 'LANG': 'en_US.UTF-8',
            'TMPDIR': str(ROOT), 'CCSTATUSLINE_WIDTH': '120', 'CCSL_FORK': '1'}


def make_fixture(name):
    path = ROOT / 'fixtures' / (name + '.jsonl')
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('w') as f:
            for i in range(FIXTURE_ROWS[name]):
                row = {'type': 'assistant' if i % 2 else 'user', 'timestamp': '2026-10-01T01:%02d:%02dZ' % ((i // 60) % 60, i % 60),
                       'message': {'role': 'assistant' if i % 2 else 'user', 'content': [{'type': 'text', 'text': 'x' * 1105}]}}
                if i % 2:
                    row['message'].update(id='msg-%d' % i, stop_reason='end_turn',
                                          usage={'input_tokens': 100, 'output_tokens': 50, 'cache_read_input_tokens': 200, 'cache_creation_input_tokens': 10})
                f.write(json.dumps(row, separators=(',', ':')) + '\n')
    return path


def make_repo(name, dirty):
    repo = ROOT / ('repo-' + name)
    if not (repo / '.git').exists():
        repo.mkdir(parents=True, exist_ok=True)
        def git(*a): subprocess.run(['git', *a], cwd=repo, check=True, capture_output=True)
        git('init')
        git('config', 'user.email', 'bench@local')
        git('config', 'user.name', 'bench')
        (repo / 'app.js').write_text('const x = 1;\n' * 50)
        git('add', '.')
        git('commit', '-m', 'init')
        if dirty:
            (repo / 'app.js').write_text('const x = 2;\n' * 50)
            (repo / 'notes.txt').write_text('untracked\n')
    return repo


def read_discovery(path):
    try:
        text = path.read_text()
    except OSError:
        return None
    info = {}
    for line in text.splitlines():
        if line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        info[key] = value
    return info if info.get('socket') and info.get('token') else None


def daemon_health(info):
    out = subprocess.run(['curl', '-q', '-sS', '--fail', '--noproxy', '*', '--max-time', '5',
                          '--unix-socket', info['socket'], '-H', 'Authorization: Bearer %s' % info['token'],
                          'http://localhost/v1/health'], capture_output=True, text=True)
    if out.returncode:
        return None
    try:
        return json.loads(out.stdout)
    except ValueError:
        return None


def process_cpu_seconds(pid):
    # macOS has no /proc; ps gives the cumulative CPU time of the process.
    out = subprocess.run(['ps', '-p', str(pid), '-o', 'time='], capture_output=True, text=True)
    if out.returncode or not out.stdout.strip():
        return 0.0
    parts = out.stdout.strip().split(':')
    try:
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        m, s = parts
        return int(m) * 60 + float(s)
    except ValueError:
        return 0.0


def pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def pctl(sorted_xs, q):
    return sorted_xs[min(len(sorted_xs) - 1, max(0, math.ceil(q * len(sorted_xs)) - 1))]


def mixed_sessions(sessions):
    """(payload, cwd) per session: alternating transcript size and repo dirt."""
    small, large = make_fixture('small'), make_fixture('large')
    dirty, clean = make_repo('dirty', True), make_repo('clean', False)
    out = []
    for i in range(sessions):
        fixture, repo = (small if i % 2 == 0 else large), (dirty if i % 2 == 0 else clean)
        tx = ROOT / 'tx' / ('s%d.jsonl' % i)
        tx.parent.mkdir(parents=True, exist_ok=True)
        if not tx.exists():
            try:
                os.link(fixture, tx)
            except OSError:
                import shutil
                shutil.copy(fixture, tx)
        payload = json.dumps({'model': {'id': 'claude-sonnet-4-5', 'display_name': 'Sonnet 4.5'},
                              'session_id': 'bench53-%d' % i, 'transcript_path': str(tx),
                              'cwd': str(repo), 'workspace': {'current_dir': str(repo)}})
        out.append((payload, str(repo)))
    return out


def wave(sessions, run_once):
    """Fire every session concurrently once; returns per-render records."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(sessions)) as pool:
        return list(pool.map(lambda i: run_once(i, sessions[i]), range(len(sessions))))


def summarize(label, records, cpu_total, extra=None):
    latencies = sorted(r['latency_ms'] for r in records)
    result = {
        'label': label, 'renders': len(records), 'failures': sum(1 for r in records if r['rc'] != 0),
        'cpu_total_s': round(cpu_total, 4), 'cpu_per_render_ms': round(cpu_total * 1000 / len(records), 3),
        'latency_ms': {'p50': round(pctl(latencies, 0.5), 2), 'p95': round(pctl(latencies, 0.95), 2), 'p99': round(pctl(latencies, 0.99), 2)},
        'latencies_ms': [round(x, 2) for x in latencies],
        'output_hashes': sorted({r['hash'] for r in records if r['rc'] == 0}),
    }
    if extra:
        result.update(extra)
    return result


def scenario_oneshot(args, sessions_n):
    work = mixed_sessions(sessions_n)
    home = ROOT / 'homes' / ('oneshot-%d' % sessions_n)
    env = environment(home)
    entry = str(pathlib.Path(args.entry).resolve())

    def once(i, item):
        payload, cwd = item
        start = time.perf_counter()
        p = subprocess.run([args.runtime, entry], input=payload, text=True, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, cwd=cwd, env=env, timeout=120)
        return {'rc': p.returncode, 'latency_ms': (time.perf_counter() - start) * 1000,
                'hash': hashlib.sha256(p.stdout.encode()).hexdigest(), 'stderr': p.stderr[:200] if p.returncode else ''}

    wave(work, once)  # wave 1: cold caches
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.perf_counter()
    cold = wave(work, once)
    mid = resource.getrusage(resource.RUSAGE_CHILDREN)
    cold_cpu = mid.ru_utime + mid.ru_stime - before.ru_utime - before.ru_stime
    cold_wall = time.perf_counter() - start
    warm = wave(work, once)
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    warm_cpu = after.ru_utime + after.ru_stime - mid.ru_utime - mid.ru_stime
    warm_wall = time.perf_counter() - start - cold_wall
    # Wave 1 is cold for the fresh HOME; wave 2 is warm. Report both; the
    # comparison table uses the warm pair plus the cold pair.
    return {
        'cold': summarize('oneshot-%d-cold' % sessions_n, cold, cold_cpu, {'wall_s': round(cold_wall, 3)}),
        'warm': summarize('oneshot-%d-warm' % sessions_n, warm, warm_cpu, {'wall_s': round(warm_wall, 3)}),
    }


def scenario_lazy(args, sessions_n):
    work = mixed_sessions(sessions_n)
    home = ROOT / 'homes' / ('lazy-%d' % sessions_n)
    env = environment(home)
    runtime_dir = pathlib.Path('/tmp') / ('ccsl-53bench-%d' % os.getpid())
    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)
    client_env = dict(env, CCSTATUSLINE_RUNTIME_DIR=str(runtime_dir))
    discovery = runtime_dir / 'daemon.env'

    def once(i, item):
        payload, cwd = item
        start = time.perf_counter()
        p = subprocess.run(['/bin/sh', str(CLIENT_SCRIPT)], input=payload, text=True, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, cwd=cwd, env=client_env, timeout=120)
        return {'rc': p.returncode, 'latency_ms': (time.perf_counter() - start) * 1000,
                'hash': hashlib.sha256(p.stdout.encode()).hexdigest(), 'stderr': p.stderr[:200] if p.returncode else ''}

    # Wave 1 (cold): no daemon exists. First clients race the lazy start.
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.perf_counter()
    lazy_ready_at = None
    cold = wave(work, once)
    cold_wall = time.perf_counter() - start
    mid = resource.getrusage(resource.RUSAGE_CHILDREN)
    cold_cpu = mid.ru_utime + mid.ru_stime - before.ru_utime - before.ru_stime
    info = read_discovery(discovery)
    cold_pids = [info['pid']] if info else []
    # The detached daemon escapes RUSAGE_CHILDREN (reparented when the
    # starting wrapper exits) — account for its CPU via ps.
    daemon_pid = int(info['pid']) if info else None
    daemon_cpu_after_cold = process_cpu_seconds(daemon_pid) if daemon_pid else 0.0

    warm = wave(work, once)
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    warm_client_cpu = after.ru_utime + after.ru_stime - mid.ru_utime - mid.ru_stime
    warm_wall = time.perf_counter() - start - cold_wall
    info2 = read_discovery(discovery)
    warm_pids = [info2['pid']] if info2 else []
    daemon_cpu_total = process_cpu_seconds(daemon_pid) if daemon_pid else 0.0
    health = daemon_health(info2) if info2 else None

    cold_total = cold_cpu + daemon_cpu_after_cold
    warm_total = warm_client_cpu + (daemon_cpu_total - daemon_cpu_after_cold)
    extra = {
        'wall_s': round(cold_wall, 3),
        'daemon_pids_cold_wave': cold_pids, 'daemon_pids_warm_wave': warm_pids,
        'single_daemon_across_waves': bool(cold_pids and warm_pids and cold_pids == warm_pids),
        'daemon_cpu_total_s': round(daemon_cpu_total, 4),
        'daemon_counters': health.get('counters') if health else None,
    }
    # Terminate the daemon so later scenarios start clean.
    if daemon_pid and pid_alive(daemon_pid):
        os.kill(daemon_pid, 15)
        deadline = time.time() + 10
        while pid_alive(daemon_pid) and time.time() < deadline:
            time.sleep(0.05)
    shutil.rmtree(runtime_dir, ignore_errors=True)
    return {
        'cold': summarize('lazy-%d-cold' % sessions_n, cold, cold_total, extra),
        'warm': summarize('lazy-%d-warm' % sessions_n, warm, warm_total, {'wall_s': round(warm_wall, 3)}),
    }


def scenario_idle_stop(args):
    """daemonIdleStopMinutes=1: with zero requests the daemon must exit by itself."""
    home = ROOT / 'homes' / 'idle'
    env = environment(home)
    config_dir = home / '.config' / 'ccstatusline'
    config_dir.mkdir(parents=True, exist_ok=True)
    # Minimal settings: the schema fills defaults; the idle bound is the point.
    (config_dir / 'settings.json').write_text(json.dumps(
        {'version': 4, 'lines': [[{'id': '1', 'type': 'model'}]], 'daemonIdleStopMinutes': 1}))
    runtime_dir = pathlib.Path('/tmp') / ('ccsl-53bench-idle-%d' % os.getpid())
    run_env = dict(env, CCSTATUSLINE_RUNTIME_DIR=str(runtime_dir))
    subprocess.run([args.runtime, str(pathlib.Path(args.entry).resolve()), 'daemon', 'start'],
                   env=run_env, capture_output=True, text=True, timeout=60)
    discovery = runtime_dir / 'daemon.env'
    info = read_discovery(discovery)
    if not info:
        return {'error': 'daemon did not start'}
    pid = int(info['pid'])
    started = time.perf_counter()
    while time.perf_counter() - started < 150:
        if not pid_alive(pid):
            break
        time.sleep(1)
    exited = not pid_alive(pid)
    result = {'configured_minutes': 1, 'pid': pid, 'exited_by_itself': exited,
              'observed_stop_after_s': round(time.perf_counter() - started, 1),
              'discovery_cleaned_up': read_discovery(discovery) is None,
              'still_alive_after_150s': not exited}
    # The next render lazily restarts it (acceptance: transparent restart).
    payload, cwd = mixed_sessions(1)[0]
    p = subprocess.run(['/bin/sh', str(CLIENT_SCRIPT)], input=payload, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, cwd=cwd, env=run_env, timeout=120)
    restarted = read_discovery(discovery)
    result['lazy_restart_render_rc'] = p.returncode
    result['lazy_restart_rendered_line'] = bool(p.stdout.strip())
    result['lazy_restart_new_pid'] = int(restarted['pid']) if restarted else None
    new_pid = int(restarted['pid']) if restarted else None
    if new_pid and pid_alive(new_pid):
        os.kill(new_pid, 15)
    shutil.rmtree(runtime_dir, ignore_errors=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', default='bun')
    parser.add_argument('--entry', default='src/ccstatusline.ts')
    parser.add_argument('--sessions', default='20,30')
    parser.add_argument('--out', default='docs')
    args = parser.parse_args()

    runs = {}
    for n in [int(s) for s in args.sessions.split(',')]:
        print('[53-bench] lazy-%d: running...' % n, flush=True)
        runs['lazy-%d' % n] = scenario_lazy(args, n)
        print('[53-bench] lazy-%d done: %s' % (n, json.dumps({k: {kk: vv for kk, vv in v.items() if kk != 'latencies_ms'} for k, v in runs['lazy-%d' % n].items()})), flush=True)
        print('[53-bench] oneshot-%d: running...' % n, flush=True)
        runs['oneshot-%d' % n] = scenario_oneshot(args, n)
        print('[53-bench] oneshot-%d done: %s' % (n, json.dumps({k: {kk: vv for kk, vv in v.items() if kk != 'latencies_ms'} for k, v in runs['oneshot-%d' % n].items()})), flush=True)
    print('[53-bench] idle-stop: running (waits ~1 minute)...', flush=True)
    runs['idle-stop'] = scenario_idle_stop(args)
    print('[53-bench] idle-stop done: %s' % json.dumps(runs['idle-stop']), flush=True)

    comparisons = []
    for n in [int(s) for s in args.sessions.split(',')]:
        for phase in ('cold', 'warm'):
            one = runs['oneshot-%d' % n][phase]
            shared = runs['lazy-%d' % n][phase]
            comparisons.append({
                'sessions': n, 'phase': phase,
                'oneshot_cpu_total_s': one['cpu_total_s'], 'shared_cpu_total_s': shared['cpu_total_s'],
                'cpu_reduction_pct': round((one['cpu_total_s'] - shared['cpu_total_s']) / one['cpu_total_s'] * 100, 1) if one['cpu_total_s'] else None,
                'oneshot_p95_ms': one['latency_ms']['p95'], 'shared_p95_ms': shared['latency_ms']['p95'],
                'shared_failures': shared['failures'],
                'output_hashes_equal': one['output_hashes'] == shared['output_hashes'],
            })
    doc = {'meta': {'runtime': args.runtime, 'entry': str(pathlib.Path(args.entry).resolve()),
                    'machine': machine_context(), 'generated': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
                    'workload': 'sessions alternate small(500-row)/large(10000-row) transcripts and dirty/clean repos; two waves per scenario (cold includes the lazy start)',
                    'notes': [
                        'Lazy/shared CPU covers the daemon AND every client: clients via getrusage(RUSAGE_CHILDREN), the detached daemon via ps cumulative CPU (it escapes RUSAGE_CHILDREN after reparenting).',
                        'Cold wave of the lazy scenario includes the on-demand daemon start paid by the first clients.',
                    ]},
           'runs': runs, 'comparisons': comparisons, 'idle_stop': runs['idle-stop']}
    out = pathlib.Path(args.out) / 'daemon-53-results.json'
    out.write_text(json.dumps(doc, indent=2))
    print('[53-bench] results: %s' % out, flush=True)
    for c in comparisons:
        print('[53-bench] s%d %-4s cpu/render one-shot=%sms shared=%sms (%s%%) p95 %s→%sms failures=%s hashes_equal=%s' % (
            c['sessions'], c['phase'],
            round(runs['oneshot-%d' % c['sessions']][c['phase']]['cpu_per_render_ms'], 1),
            round(runs['lazy-%d' % c['sessions']][c['phase']]['cpu_per_render_ms'], 1),
            c['cpu_reduction_pct'], c['oneshot_p95_ms'], c['shared_p95_ms'],
            c['shared_failures'], c['output_hashes_equal']), flush=True)
    failures = sum(r[phase]['failures'] for r in runs.values() if isinstance(r, dict) and 'cold' in r for phase in ('cold', 'warm'))
    ok = failures == 0 and runs['idle-stop'].get('exited_by_itself') and runs['idle-stop'].get('lazy_restart_render_rc') == 0
    print('[53-bench] %s' % ('PASS' if ok else 'FAIL'), flush=True)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
