import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { getPackageVersion } from '../../utils/terminal';
import type {
    EnsureOutcome,
    LifecycleOptions
} from '../lifecycle';
import {
    daemonStatus,
    ensureDaemon,
    stopDaemon
} from '../lifecycle';
import { getDiscoveryPath } from '../paths';
import type { DaemonServerHandle } from '../server';
import { createDaemonServer } from '../server';

import { hermeticDependencies } from './test-daemon';

// Lifecycle coordination tests (#17): cold-start convergence, stale-state
// recovery, verified stops, and upgrade restarts. The daemon under
// coordination runs in-process through the spawnDaemon seam, so the real
// discovery/health handshake is exercised hermetically; one test at the end
// drives the real detached-spawn default against a real child process.

const ENTRY_SCRIPT = fileURLToPath(new URL('../../../src/ccstatusline.ts', import.meta.url));
const UPGRADED_VERSION = '9.9.9-lifecycle-upgrade';

let runtimeDir = '';
const savedEnv: Record<string, string | undefined> = {};
const servers: DaemonServerHandle[] = [];
const socketsToClose: net.Server[] = [];

beforeEach(() => {
    runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-life-'));
    for (const name of ['CCSTATUSLINE_RUNTIME_DIR', 'XDG_RUNTIME_DIR', 'TMPDIR']) {
        savedEnv[name] = process.env[name];
    }
    process.env.CCSTATUSLINE_RUNTIME_DIR = runtimeDir;
    Reflect.deleteProperty(process.env, 'XDG_RUNTIME_DIR');
    process.env.TMPDIR = os.tmpdir();
});

afterEach(async () => {
    for (const server of servers.splice(0)) {
        await server.stop().catch(() => undefined);
    }
    for (const socketServer of socketsToClose.splice(0)) {
        await new Promise<void>(resolve => socketServer.close(() => { resolve(); }));
    }
    // A failed subprocess test must not leak a detached daemon.
    await stopDaemon({ runtimeDir, timings: { healthMs: 300, stopMs: 500, killMs: 300, pollMs: 20 } }).catch(() => undefined);
    for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
            Reflect.deleteProperty(process.env, name);
        } else {
            process.env[name] = value;
        }
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
});

/** A real in-process daemon in the test runtime dir, with hermetic providers. */
async function startServerHere(versionOverride?: string): Promise<DaemonServerHandle> {
    const server = createDaemonServer({
        dependencies: hermeticDependencies(),
        ...(versionOverride === undefined ? {} : { versionOverride })
    });
    await server.start();
    servers.push(server);
    return server;
}

function findDeadPid(): number {
    for (let candidate = 40000; candidate < 400000; candidate += 7) {
        try {
            process.kill(candidate, 0);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                return candidate;
            }
        }
    }
    throw new Error('no dead pid found');
}

interface Recorder {
    signals: number[];
    spawns: number;
}

function recorder(): Recorder {
    return { signals: [], spawns: 0 };
}

/**
 * Spawn seam whose "child" is a real in-process daemon in the test runtime
 * dir, after an optional delay so concurrent callers race the cold start.
 */
function spawnInProcessServer(times: Recorder, delayMs = 0, versionOverride?: string): LifecycleOptions['spawnDaemon'] {
    return () => {
        times.spawns++;
        setTimeout(() => {
            void startServerHere(versionOverride).catch(() => undefined);
        }, delayMs);
        return {};
    };
}

function writeDiscovery(fields: Record<string, string>): string {
    const discoveryPath = getDiscoveryPath(runtimeDir);
    fs.writeFileSync(discoveryPath, Object.entries(fields).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    return discoveryPath;
}

function writeStartupLock(pid: number, acquiredMs: number): void {
    fs.writeFileSync(path.join(runtimeDir, 'daemon-start.lock'), `pid=${pid}\nacquired=${new Date(acquiredMs).toISOString()}\n`, { mode: 0o600 });
}

describe('daemon lifecycle: cold start', () => {
    it('starts a daemon and reports it as the same server on the next call', async () => {
        const times = recorder();
        const first: EnsureOutcome = await ensureDaemon({
            runtimeDir,
            spawnDaemon: spawnInProcessServer(times, 50)
        });
        expect(first.state).toBe('started');
        expect(first.version).toBe(getPackageVersion());
        expect(times.spawns).toBe(1);
        expect(fs.existsSync(getDiscoveryPath(runtimeDir))).toBe(true);

        const second = await ensureDaemon({ runtimeDir, spawnDaemon: spawnInProcessServer(times) });
        expect(second.state).toBe('already-running');
        expect(second.pid).toBe(first.pid);
        expect(times.spawns).toBe(1);
    });

    it('converges concurrent cold starts on exactly one server', async () => {
        const times = recorder();
        const outcomes = await Promise.all(Array.from({ length: 8 }, () => ensureDaemon({
            runtimeDir,
            spawnDaemon: spawnInProcessServer(times, 150)
        })));

        expect(times.spawns).toBe(1);
        const pids = new Set(outcomes.map(outcome => outcome.pid));
        expect(pids.size).toBe(1);
        expect(outcomes.every(outcome => outcome.state === 'started' || outcome.state === 'already-running')).toBe(true);
        expect(servers).toHaveLength(1);
    });

    it('fails bounded when the spawned daemon exits during startup, and releases the lock', async () => {
        const times = recorder();
        await expect(ensureDaemon({
            runtimeDir,
            spawnDaemon: () => {
                times.spawns++;
                return { once: (_event, listener) => { listener(1); } };
            },
            timings: { startupMs: 1000, pollMs: 20, healthMs: 200 }
        })).rejects.toThrow('exited during startup');

        // The lock must be gone so the next start is not blocked.
        const retried = await ensureDaemon({ runtimeDir, spawnDaemon: spawnInProcessServer(times, 20) });
        expect(retried.state).toBe('started');
        expect(times.spawns).toBe(2);
    });
});

describe('daemon lifecycle: stale state recovery', () => {
    it('recovers from a stale discovery file and a stale socket of a dead owner', async () => {
        const deadPid = findDeadPid();
        writeDiscovery({
            protocol: '1',
            version: '0.0.0-dead',
            pid: String(deadPid),
            // A path with nothing behind it: probes fail fast with
            // ECONNREFUSED on every platform (a bound-but-silent listener
            // would make each probe wait out the full health timeout).
            socket: path.join(runtimeDir, 'daemon-gone.sock'),
            token: 'f'.repeat(64)
        });
        // A leftover socket file from the killed owner (kill -9 never cleans),
        // at its own path: the server-side sweep must remove it on start.
        const staleSocket = path.join(runtimeDir, `daemon-${deadPid}.sock`);
        const staleServer = net.createServer();
        await new Promise<void>(resolve => staleServer.listen({ path: staleSocket }, resolve));
        socketsToClose.push(staleServer);

        const times = recorder();
        const terminate = (pid: number) => { times.signals.push(pid); };
        const outcome = await ensureDaemon({
            runtimeDir,
            terminate,
            kill: terminate,
            spawnDaemon: spawnInProcessServer(times, 30),
            timings: { healthMs: 200, pollMs: 25 }
        });

        expect(outcome.state).toBe('started');
        expect(times.signals).toHaveLength(0);
        expect(fs.existsSync(staleSocket)).toBe(false);
        const discovery = fs.readFileSync(getDiscoveryPath(runtimeDir), 'utf8');
        expect(discovery).not.toContain('0.0.0-dead');
        expect(discovery).not.toContain(`pid=${deadPid}`);
    });

    it('keeps health probes bounded against a bound-but-silent socket', async () => {
        // A listener with no HTTP server behind it accepts connections and
        // never answers: bun's ClientRequest timeout does not fire on Linux,
        // so the external per-probe timer is what keeps ensureDaemon bounded.
        const silentSocket = path.join(runtimeDir, 'daemon-silent.sock');
        const silentServer = net.createServer();
        await new Promise<void>(resolve => silentServer.listen({ path: silentSocket }, resolve));
        // Closing a server with connections accepted-and-ignored has proven
        // flaky across bun runtimes, so this server is never joined on: it is
        // unreferenced (holds nothing open) and force-cleaned with its socket
        // file at the end of the test.
        silentServer.unref();
        try {
            writeDiscovery({
                protocol: '1',
                version: '0.0.0-silent',
                pid: String(findDeadPid()),
                socket: silentSocket,
                token: 'd'.repeat(64)
            });

            const times = recorder();
            const outcome = await ensureDaemon({
                runtimeDir,
                spawnDaemon: spawnInProcessServer(times, 20),
                timings: { healthMs: 150, pollMs: 25 }
            });

            expect(outcome.state).toBe('started');
            expect(times.signals).toHaveLength(0);
        } finally {
            try {
                (silentServer as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
            } catch {
                // Older runtimes: the unref already keeps the loop free.
            }
            silentServer.close();
            fs.rmSync(silentSocket, { force: true });
        }
    }, 15000);

    it('never signals a live pid that does not answer as a daemon (pid reuse)', async () => {
        const times = recorder();
        const terminate = (pid: number) => { times.signals.push(pid); };
        // Discovery claims a live pid (this test process) but no daemon
        // answers on the named socket: the pid slot was recycled.
        writeDiscovery({
            protocol: '1',
            version: '0.0.0-reused',
            pid: String(process.pid),
            socket: path.join(runtimeDir, 'daemon-missing.sock'),
            token: 'a'.repeat(64)
        });

        const stopped = await stopDaemon({ runtimeDir, terminate, kill: terminate });
        expect(stopped.state).toBe('not-running');
        expect(times.signals).toHaveLength(0);
        // A live but silent pid is never signaled and its discovery is left
        // in place (it may be a recycled pid or a hung server); ensureDaemon
        // is the step that replaces it.
        expect(fs.existsSync(getDiscoveryPath(runtimeDir))).toBe(true);

        // ensure likewise recovers without signaling the live pid.
        const started = await ensureDaemon({ runtimeDir, terminate, kill: terminate, spawnDaemon: spawnInProcessServer(times, 20) });
        expect(started.state).toBe('started');
        expect(times.signals).toHaveLength(0);
        const discovery = fs.readFileSync(getDiscoveryPath(runtimeDir), 'utf8');
        expect(discovery).not.toContain('0.0.0-reused');
    });

    it('waits bounded instead of spawning while another starter holds the lock', async () => {
        writeStartupLock(process.pid, Date.now());
        const times = recorder();
        await expect(ensureDaemon({
            runtimeDir,
            spawnDaemon: spawnInProcessServer(times),
            timings: { startupMs: 500, pollMs: 20, healthMs: 200 }
        })).rejects.toThrow('did not become ready');
        expect(times.spawns).toBe(0);
        // The lock belongs to a live other starter: it must survive.
        expect(fs.existsSync(path.join(runtimeDir, 'daemon-start.lock'))).toBe(true);
    });

    it('evicts a lock whose owner died', async () => {
        writeStartupLock(findDeadPid(), Date.now());
        const times = recorder();
        const outcome = await ensureDaemon({ runtimeDir, spawnDaemon: spawnInProcessServer(times, 20) });
        expect(outcome.state).toBe('started');
        expect(times.spawns).toBe(1);
    });

    it('evicts a lock that overstayed its age bound even while its owner lives', async () => {
        writeStartupLock(process.pid, Date.now() - 60_000);
        const times = recorder();
        const outcome = await ensureDaemon({
            runtimeDir,
            spawnDaemon: spawnInProcessServer(times, 20),
            timings: { lockStaleMs: 30_000 }
        });
        expect(outcome.state).toBe('started');
        expect(times.spawns).toBe(1);
    });
});

describe('daemon lifecycle: verified stop', () => {
    it('stops a healthy daemon after identity verification and cleans its endpoints', async () => {
        const server = await startServerHere();
        const times = recorder();
        const terminate = (pid: number) => {
            times.signals.push(pid);
            void server.stop();
        };

        const outcome = await stopDaemon({ runtimeDir, terminate, kill: terminate });

        expect(outcome).toEqual({ state: 'stopped', pid: process.pid });
        expect(times.signals).toEqual([process.pid]);
        expect(fs.existsSync(server.discoveryPath)).toBe(false);
        expect(fs.existsSync(server.socketPath)).toBe(false);
    });

    it('falls back to SIGKILL only after re-identifying the daemon', async () => {
        const server = await startServerHere();
        const times = recorder();
        let kills = 0;
        const terminate = (pid: number) => { times.signals.push(pid); }; // Survives SIGTERM.
        const kill = (pid: number) => {
            kills++;
            times.signals.push(pid);
            void server.stop();
        };

        const outcome = await stopDaemon({ runtimeDir, terminate, kill, timings: { stopMs: 200, killMs: 500, pollMs: 20, healthMs: 300 } });

        expect(outcome).toEqual({ state: 'stopped', pid: process.pid });
        // Exactly one SIGTERM and one re-identified SIGKILL.
        expect(times.signals).toEqual([process.pid, process.pid]);
        expect(kills).toBe(1);
    });

    it('refuses the SIGKILL fallback when the daemon stops answering mid-shutdown', async () => {
        const server = await startServerHere();
        const times = recorder();
        let kills = 0;
        // The pid stays alive (this test process) but the daemon's endpoint
        // goes silent mid-shutdown: what lives behind a silent socket may be
        // a recycled pid, so the fatal signal must be refused. Replacing the
        // socket file with a regular file reproduces exactly that state —
        // connects fail instantly and health stops answering.
        const terminate = (pid: number) => {
            times.signals.push(pid);
            fs.rmSync(server.socketPath, { force: true });
            fs.writeFileSync(server.socketPath, 'not a socket');
        };
        const kill = (pid: number) => {
            kills++;
            times.signals.push(pid);
        };

        await expect(stopDaemon({ runtimeDir, terminate, kill, timings: { stopMs: 200, killMs: 500, pollMs: 20, healthMs: 300 } }))
            .rejects.toThrow('refusing to SIGKILL');
        expect(times.signals).toEqual([process.pid]);
        expect(kills).toBe(0);
    });

    it('refuses to stop when the socket owner does not match the discovery pid', async () => {
        const server = await startServerHere();
        // Tamper: discovery claims a different pid than the live server.
        const tampered = fs.readFileSync(server.discoveryPath, 'utf8')
            .replace(`pid=${process.pid}`, `pid=${findDeadPid()}`);
        fs.writeFileSync(server.discoveryPath, tampered, { mode: 0o600 });

        const times = recorder();
        const terminate = (pid: number) => { times.signals.push(pid); };
        await expect(stopDaemon({ runtimeDir, terminate, kill: terminate })).rejects.toThrow('identity mismatch');
        expect(times.signals).toHaveLength(0);
        // The live daemon is untouched.
        expect(fs.existsSync(server.socketPath)).toBe(true);
    });
});

describe('daemon lifecycle: upgrades', () => {
    it('restarts an alive incompatible daemon after verifying its identity', async () => {
        const oldServer = await startServerHere(); // Reports the current build.
        const times = recorder();
        const terminate = (pid: number) => {
            times.signals.push(pid);
            void oldServer.stop();
        };

        const outcome = await ensureDaemon({
            runtimeDir,
            currentVersion: UPGRADED_VERSION,
            terminate,
            kill: terminate,
            spawnDaemon: spawnInProcessServer(times, 30, UPGRADED_VERSION)
        });

        expect(outcome.state).toBe('restarted');
        expect(outcome.version).toBe(UPGRADED_VERSION);
        expect(times.signals).toEqual([process.pid]);
        // Both in-process servers share this process's pid and therefore the
        // same socket path, so the ownership change is proven by the
        // discovery file: it now names the upgraded build and a fresh token,
        // not the superseded server's.
        const discovery = fs.readFileSync(getDiscoveryPath(runtimeDir), 'utf8');
        expect(discovery).toContain(`version=${UPGRADED_VERSION}`);
        expect(discovery).not.toContain(`token=${oldServer.token}`);
    });

    it('reports an alive incompatible daemon as incompatible, not running', async () => {
        await startServerHere();
        const outcome = await daemonStatus({ runtimeDir, currentVersion: UPGRADED_VERSION });
        expect(outcome.state).toBe('incompatible');
        if (outcome.state === 'incompatible') {
            expect(outcome.expectedVersion).toBe(UPGRADED_VERSION);
        }
    });
});

describe('daemon lifecycle: status', () => {
    it('reports stopped without a discovery file', async () => {
        const outcome = await daemonStatus({ runtimeDir });
        expect(outcome.state).toBe('stopped');
    });

    it('reports running for a healthy compatible daemon with observability fields', async () => {
        await startServerHere();
        const outcome = await daemonStatus({ runtimeDir });
        expect(outcome.state).toBe('running');
        if (outcome.state === 'running') {
            expect(outcome.pid).toBe(process.pid);
            expect(outcome.startedAt).toBeDefined();
            // #19 status UX: uptime and aggregate counters come from
            // /v1/health; this status call itself bumps ok.
            expect(outcome.uptimeSeconds).toBeGreaterThanOrEqual(0);
            expect(outcome.counters?.ok).toBeGreaterThanOrEqual(1);
            expect(Object.getPrototypeOf(outcome.counters ?? {})).toBe(Object.prototype);
            // Never secrets: the reported shape carries no discovery token.
            expect(JSON.stringify(outcome)).not.toContain('token');
        }
    });

    it('reports stale when the discovery points at a daemon that does not answer', async () => {
        const deadPid = findDeadPid();
        writeDiscovery({
            protocol: '1',
            version: '0.0.0-dead',
            pid: String(deadPid),
            socket: path.join(runtimeDir, `daemon-${deadPid}.sock`),
            token: 'e'.repeat(64)
        });
        const outcome = await daemonStatus({ runtimeDir });
        expect(outcome.state).toBe('stale');
        if (outcome.state === 'stale') {
            expect(outcome.detail).toContain(String(deadPid));
        }
    });
});

describe('daemon lifecycle: real subprocess end-to-end', () => {
    it('cold-starts a real detached daemon and stops it via SIGTERM', { timeout: 30_000 }, async () => {
        const outcome = await ensureDaemon({ runtimeDir, daemonEntry: ENTRY_SCRIPT });
        expect(outcome.state).toBe('started');
        expect(outcome.pid).not.toBe(process.pid);

        // The child is a real daemon host: health over its own socket.
        const status = await daemonStatus({ runtimeDir });
        expect(status.state).toBe('running');

        // Real SIGTERM path: the child's own signal handler cleans up.
        const stopped = await stopDaemon({ runtimeDir });
        expect(stopped.state).toBe('stopped');
        expect(fs.existsSync(getDiscoveryPath(runtimeDir))).toBe(false);
        expect(fs.existsSync(path.join(runtimeDir, 'daemon-start.lock'))).toBe(false);
    });
});
