import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type { StartedTestDaemon } from './test-daemon';
import {
    MODEL_ONLY_SETTINGS,
    startTestDaemon,
    stopTestDaemon
} from './test-daemon';

// End-to-end test of the shipped shell client: a real /bin/sh process, real
// curl, real Unix socket. This is the acceptance run for the repaint path —
// stdout carries the rendered line only on success.

const clientPath = fileURLToPath(new URL('../../../client/ccstatusline-ipc', import.meta.url));

let payloadCounter = 0;

const started: StartedTestDaemon[] = [];

async function start(
    overrides: Parameters<typeof startTestDaemon>[0] = {},
    options: Parameters<typeof startTestDaemon>[1] = {}
): Promise<StartedTestDaemon> {
    const handle = await startTestDaemon(overrides, options);
    started.push(handle);
    return handle;
}

afterEach(async () => {
    for (const handle of started.splice(0)) {
        await stopTestDaemon(handle);
    }
});

async function runClient(runtimeDir: string, payload: string, extraEnv: Record<string, string> = {}): Promise<{
    status: number;
    stdout: string;
    stderr: string;
}> {
    // stdin comes from a file, not a spawn pipe: curl reads the request body
    // from the saved fd until EOF, and a pipe held open by the test harness
    // would deadlock it. A regular file gives EOF — the same as Claude Code
    // closing the statusline command's stdin. Async spawn rather than
    // spawnSync: bun's spawnSync pumps the event loop while the in-process
    // test daemon is serving over the same loop.
    // Unique per call: concurrent clients against one runtime dir must not
    // overwrite each other's buffered payload.
    const payloadPath = path.join(runtimeDir, `payload-${++payloadCounter}.json`);
    fs.writeFileSync(payloadPath, payload);
    return new Promise((resolve, reject) => {
        const child = spawn('/bin/sh', [
            '-c',
            `"${clientPath}" < "${payloadPath}"`,
            'ccstatusline-ipc-test'
        ], {
            cwd: runtimeDir,
            env: {
                ...process.env,
                CCSTATUSLINE_RUNTIME_DIR: runtimeDir,
                ...extraEnv
            }
        });
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('client run timed out'));
        }, 20000);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', reject);
        child.on('close', (code) => {
            clearTimeout(timeout);
            resolve({ status: code ?? -1, stdout, stderr });
        });
    });
}

describe('shell client end to end', () => {
    it('forwards the payload and prints exactly the rendered line', async () => {
        const { daemon } = await start();
        const payload = JSON.stringify({ model: { id: 'claude-client-model' }, cwd: '/tmp' });

        const result = await runClient(daemon.runtimeDir, payload);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('claude-client-model');
        expect(result.stdout.endsWith('\n')).toBe(true);
    });

    it('carries invocation context (env vars and cwd) through the header', async () => {
        const { daemon, dependencies } = await start();
        const payload = JSON.stringify({ model: { id: 'claude-client-model' }, cwd: '/tmp' });

        const result = await runClient(daemon.runtimeDir, payload, {
            CLAUDE_CONFIG_DIR: '/ccsd-client-config',
            CCSTATUSLINE_WIDTH: '90'
        });

        expect(result.status).toBe(0);
        const invocation = dependencies.invocations.at(-1);
        expect(invocation?.env.CLAUDE_CONFIG_DIR).toBe('/ccsd-client-config');
        expect(invocation?.env.CCSTATUSLINE_WIDTH).toBe('90');
        // The client reports its physical working directory (pwd -P), which
        // on macOS resolves the /var -> /private/var symlink.
        expect(invocation?.cwd).toBe(fs.realpathSync(daemon.runtimeDir));
    });

    it('round-trips a Unicode model id byte-exact', async () => {
        const { daemon } = await start();
        const payload = JSON.stringify({ model: { id: 'модель-✓-Ünïcode' }, cwd: '/tmp' });

        const result = await runClient(daemon.runtimeDir, payload);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('модель-✓-Ünïcode');
    });

    it('treats an empty successful render as success with no output', async () => {
        const { daemon } = await start({
            loadSettings: () => import('../../types/Settings').then(({ DEFAULT_SETTINGS }) => ({
                settings: { ...DEFAULT_SETTINGS, lines: [] },
                loadError: null
            }))
        });

        const result = await runClient(daemon.runtimeDir, JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' }));

        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('');
    });

    it('fails with empty stdout when the daemon is not running and autostart is disabled', async () => {
        const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-client-none-'));
        try {
            const result = await runClient(runtimeDir, '{}', { CCSTATUSLINE_NO_AUTOSTART: '1' });

            expect(result.status).not.toBe(0);
            expect(result.stdout).toBe('');
            expect(result.stderr).toContain('ccstatusline-ipc');
        } finally {
            fs.rmSync(runtimeDir, { recursive: true, force: true });
        }
    });

    it('attempts a lazy start when no daemon is running and autostart is on', async () => {
        const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-client-lazy-'));
        try {
            // The lazy-start command records that it ran, then fails to
            // produce a daemon: the client must still die with empty stdout
            // (never a partial line), but the start was attempted.
            const marker = path.join(runtimeDir, 'started');
            const result = await runClient(runtimeDir, '{}', { CCSTATUSLINE_DAEMON_START: `touch ${marker}` });

            expect(fs.existsSync(marker)).toBe(true);
            expect(result.status).not.toBe(0);
            expect(result.stdout).toBe('');
        } finally {
            fs.rmSync(runtimeDir, { recursive: true, force: true });
        }
    });

    it('fails with empty stdout on a wrong token (HTTP 401) instead of printing the error body', async () => {
        const { daemon } = await start();
        fs.writeFileSync(daemon.discoveryPath, fs.readFileSync(daemon.discoveryPath, 'utf8').replace(daemon.token, 'a'.repeat(64)));

        const result = await runClient(daemon.runtimeDir, JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' }));

        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('ccstatusline-ipc');
    });

    it('fails with empty stdout when the discovery file names a dead socket', async () => {
        const { daemon } = await start();
        // stop() unlinks the socket and the discovery file but keeps the
        // runtime dir; recreate only the discovery pointing at the dead socket.
        await daemon.stop();
        fs.writeFileSync(daemon.discoveryPath, [
            'protocol=1',
            `socket=${daemon.socketPath}`,
            `token=${daemon.token}`
        ].join('\n') + '\n', { mode: 0o600 });

        const result = await runClient(daemon.runtimeDir, JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' }), { CCSTATUSLINE_NO_AUTOSTART: '1' });

        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
    });

    it('refuses a discovery file with an unsupported protocol version', async () => {
        const { daemon } = await start();
        fs.writeFileSync(daemon.discoveryPath, fs.readFileSync(daemon.discoveryPath, 'utf8').replace('protocol=1', 'protocol=99'));

        const result = await runClient(daemon.runtimeDir, JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' }));

        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('protocol');
    });
});

// On-demand lifecycle (#53): the shared-mode client lazily starts a daemon
// (serialized by the #47 cold-start lock inside `daemon start`) and retries
// the render into it. The "daemon start" command is replaced with a stub that
// republishes the in-process test daemon's discovery — what is under test is
// the client's retry logic, not the server itself.
describe('shell client on-demand start (#53)', () => {
    /** A start stub: after a cold-start delay, publish $CCSD_DISCOVERY as the discovery. */
    function writeStartStub(dir: string, delayMs: number): string {
        const stubPath = path.join(dir, 'start-stub.sh');
        fs.writeFileSync(stubPath, [
            '#!/bin/sh',
            `sleep ${(delayMs / 1000).toFixed(2)}`,
            'printf \'%s\' "$CCSD_DISCOVERY" > "$CCSTATUSLINE_RUNTIME_DIR/daemon.env"'
        ].join('\n'), { mode: 0o700 });
        return stubPath;
    }

    async function runLazyClient(dir: string, payload: string, stubPath: string, discovery: string): Promise<{
        status: number;
        stdout: string;
        stderr: string;
    }> {
        return runClient(dir, payload, {
            CCSTATUSLINE_DAEMON_START: `sh ${stubPath}`,
            CCSD_DISCOVERY: discovery
        });
    }

    it('lazily starts the daemon and retries the render into it', async () => {
        const { daemon } = await start();
        const discovery = fs.readFileSync(daemon.discoveryPath, 'utf8');
        const stub = writeStartStub(daemon.runtimeDir, 300);

        // Simulate the idle-stopped state: no daemon endpoints on disk.
        fs.unlinkSync(daemon.discoveryPath);
        const result = await runLazyClient(daemon.runtimeDir, JSON.stringify({ model: { id: 'claude-lazy-model' }, cwd: '/tmp' }), stub, discovery);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('claude-lazy-model');
        // The stub republished exactly the discovery it was given.
        expect(fs.readFileSync(daemon.discoveryPath, 'utf8')).toBe(discovery);
    });

    it('concurrent cold clients all render through the lazily started daemon', async () => {
        const { daemon, dependencies } = await start();
        const discovery = fs.readFileSync(daemon.discoveryPath, 'utf8');
        const stub = writeStartStub(daemon.runtimeDir, 400);
        fs.unlinkSync(daemon.discoveryPath);

        const dirs = Array.from({ length: 5 }, () => fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-client-race-')));
        try {
            const results = await Promise.all(dirs.map(dir => runLazyClient(
                dir,
                JSON.stringify({ model: { id: `claude-race-${dir.slice(-6)}` }, cwd: '/tmp' }),
                stub,
                discovery
            )));

            for (const result of results) {
                expect(result.status).toBe(0);
                expect(result.stdout).not.toBe('');
            }
            // One daemon served every racing client — no second server, no
            // lost renders.
            expect(dependencies.invocations).toHaveLength(5);
            expect(daemon.counters.ok).toBe(5);
        } finally {
            for (const dir of dirs) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    });

    it('retries into a fresh daemon when the discovered one died mid-flight', async () => {
        // Daemon A: dead, but its discovery still names the dead socket (the
        // client must hit the connect failure and restart). Daemon B: live,
        // published by the start stub into A's runtime dir.
        const dead = await start();
        await dead.daemon.stop();
        fs.writeFileSync(dead.daemon.discoveryPath, [
            'protocol=1',
            `socket=${dead.daemon.socketPath}`,
            `token=${dead.daemon.token}`
        ].join('\n') + '\n', { mode: 0o600 });

        const live = await start();
        const liveDiscovery = fs.readFileSync(live.daemon.discoveryPath, 'utf8');
        const stub = writeStartStub(live.daemon.runtimeDir, 100);

        const result = await runClient(dead.daemon.runtimeDir, JSON.stringify({ model: { id: 'claude-restart-model' }, cwd: '/tmp' }), {
            CCSTATUSLINE_DAEMON_START: `sh ${stub}`,
            CCSD_DISCOVERY: liveDiscovery
        });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('claude-restart-model');
        expect(live.dependencies.invocations).toHaveLength(1);
    });

    it('rides out a 503 burst through the retry ladder and renders every client', async () => {
        const { daemon } = await start({
            loadSettings: async () => {
                await new Promise((resolve) => { setTimeout(resolve, 250); });
                return { settings: { ...MODEL_ONLY_SETTINGS }, loadError: null };
            }
        }, { maxInFlightRenders: 1 });
        const first = runClient(daemon.runtimeDir, JSON.stringify({ model: { id: 'claude-burst-a' }, cwd: '/tmp' }));
        const second = runClient(daemon.runtimeDir, JSON.stringify({ model: { id: 'claude-burst-b' }, cwd: '/tmp' }));
        const [a, b] = await Promise.all([first, second]);

        expect(a.status).toBe(0);
        expect(b.status).toBe(0);
        expect(a.stdout).toContain('claude-burst-a');
        expect(b.stdout).toContain('claude-burst-b');
    });

    it('never starts a daemon from the one-shot render path (opt-in gating)', async () => {
        const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-gate-'));
        const repoRoot = path.resolve(path.dirname(clientPath), '..');
        const payload = JSON.stringify({ model: { id: 'claude-gate-model' }, cwd: repoRoot });
        try {
            const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
                const child = spawn(process.execPath, [path.join(repoRoot, 'src', 'ccstatusline.ts')], {
                    cwd: repoRoot,
                    env: {
                        ...process.env,
                        CCSTATUSLINE_RUNTIME_DIR: runtimeDir,
                        CLAUDE_CONFIG_DIR: path.join(runtimeDir, 'claude'),
                        XDG_CONFIG_HOME: path.join(runtimeDir, 'config')
                    }
                });
                const timeout = setTimeout(() => {
                    child.kill('SIGKILL');
                    reject(new Error('one-shot render timed out'));
                }, 20000);
                let stdout = '';
                let stderr = '';
                child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
                child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
                child.on('error', reject);
                child.on('close', (code) => {
                    clearTimeout(timeout);
                    resolve({ status: code, stdout, stderr });
                });
                // Piped payload, then EOF — how Claude Code drives one-shot mode.
                child.stdin.end(payload);
            });

            expect(result.status).toBe(0);
            expect(result.stdout).toContain('claude-gate-model');
            // No daemon was spawned: no discovery, no startup lock, no socket.
            expect(fs.readdirSync(runtimeDir)).toEqual([]);
        } finally {
            fs.rmSync(runtimeDir, { recursive: true, force: true });
        }
    });
});
