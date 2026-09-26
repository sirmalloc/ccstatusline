import concurrent.futures, hashlib, json, os, pathlib, resource, statistics, subprocess, sys, tempfile, time
# Set CCSTATUSLINE_BENCH_DIR to reuse a fixture across before/after invocations.
ROOT = pathlib.Path(os.environ.get('CCSTATUSLINE_BENCH_DIR') or tempfile.mkdtemp(prefix='ccstatusline-bench-')).resolve()
(ROOT / 'results').mkdir(parents=True, exist_ok=True)

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

if __name__ == '__main__': run(sys.argv[1], sys.argv[2], sys.argv[3], '--width' in sys.argv)
