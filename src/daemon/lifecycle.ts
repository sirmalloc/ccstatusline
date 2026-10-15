import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import { getConfigPath } from '../utils/config';
import { getPackageVersion } from '../utils/terminal';

import {
    ensureRuntimeDir,
    getDiscoveryPath,
    getRuntimeDir
} from './paths';
import { PROTOCOL_VERSION } from './protocol';

// Daemon lifecycle (#17): coordinated cold start, stale-state recovery,
// upgrade restarts, and verified shutdown for the shared background renderer.
//
// Invariants (epic #14, "lifecycle and failure behavior"):
// - Concurrent first starts converge on one server: an atomic per-user
//   startup lock (O_EXCL create) serializes starters; losers poll for the
//   winner's readiness handshake instead of spawning a second server.
// - A live server's endpoint is never unlinked and an unrelated process is
//   never signaled. The only destructive action is a signal, and only after
//   positive identity: the daemon answered /v1/health on its own socket,
//   authenticated by the discovery token, reporting the pid named in the
//   discovery file written next to it.
// - Old client vs incompatible server is an explicit upgrade restart, never
//   a silent reuse: health protocol and build identity must match the
//   client's own build before a daemon counts as ready.

/** Milliseconds the startup lock may sit unused before it can be evicted. */
export const LOCK_STALE_MS = 30_000;
/** Bounded wait for a freshly spawned (or concurrently starting) daemon. */
export const STARTUP_TIMEOUT_MS = 10_000;
/** Bounded wait between SIGTERM and the SIGKILL fallback. */
export const STOP_TIMEOUT_MS = 5_000;
/** Bounded wait for death after SIGKILL. */
export const KILL_TIMEOUT_MS = 2_000;
/** Per-attempt health probe timeout. */
export const HEALTH_TIMEOUT_MS = 2_000;
/** Poll interval for readiness and shutdown observation. */
export const POLL_INTERVAL_MS = 100;

export interface LifecycleTimings {
    healthMs: number;
    startupMs: number;
    stopMs: number;
    killMs: number;
    pollMs: number;
    lockStaleMs: number;
}

const DEFAULT_TIMINGS: LifecycleTimings = {
    healthMs: HEALTH_TIMEOUT_MS,
    startupMs: STARTUP_TIMEOUT_MS,
    stopMs: STOP_TIMEOUT_MS,
    killMs: KILL_TIMEOUT_MS,
    pollMs: POLL_INTERVAL_MS,
    lockStaleMs: LOCK_STALE_MS
};

/** Fields the daemon publishes in the discovery file (see server.ts). */
export interface DaemonDiscovery {
    protocol: number;
    version: string;
    pid: number;
    socket: string;
    token: string;
}

/** The subset of /v1/health the lifecycle reasons about. */
export interface DaemonHealth {
    protocol: number;
    version: string;
    pid: number;
    /** Optional observability fields (#19) — never secrets, safe to print. */
    runtime?: string;
    startedAt?: string;
    uptimeSeconds?: number;
    lastRenderMs?: number | null;
    activeRenders?: number;
    counters?: Record<string, number>;
}

export interface LifecycleOptions {
    /** Test seam: runtime directory (defaults to the per-user runtime dir). */
    runtimeDir?: string;
    /** Test seam: the client build identity to converge on. */
    currentVersion?: string;
    /** Test seam: entry script passed to the spawned daemon host process. */
    daemonEntry?: string;
    /** Test seam: replaces the detached spawn (return a handle to get early exit detection). */
    spawnDaemon?: () => SpawnedDaemon | undefined;
    /** Test seam: replaces SIGTERM. */
    terminate?: (pid: number) => void;
    /** Test seam: replaces the SIGKILL fallback. */
    kill?: (pid: number) => void;
    /** Test seam: override individual timeouts. */
    timings?: Partial<LifecycleTimings>;
}

/** Minimal shape of a spawned child the lifecycle watches for early exit. */
export interface SpawnedDaemon { once?: (event: 'exit', listener: (code: number | null) => void) => void }

export interface EnsureOutcome {
    state: 'already-running' | 'started' | 'restarted';
    pid: number;
    version: string;
}

export type StopOutcome
    = | { state: 'stopped'; pid: number }
        | { state: 'not-running'; detail?: string };

export type StatusOutcome
    = | {
        state: 'running';
        pid: number;
        version: string;
        protocol: number;
        startedAt: string | undefined;
        runtime?: string;
        uptimeSeconds?: number;
        lastRenderMs?: number | null;
        activeRenders?: number;
        counters?: Record<string, number>;
    }
    | { state: 'stopped' }
    | { state: 'stale'; detail: string }
    | { state: 'incompatible'; pid: number; version: string; protocol: number; expectedVersion: string };

const LOCK_FILE_NAME = 'daemon-start.lock';

// ---------- discovery file ----------

/**
 * Parse the flat KEY=VALUE discovery format. Prefix matching keeps values
 * with '=' intact (socket paths may contain any byte but NUL and newline).
 * Returns null when required fields are missing or malformed.
 */
export function parseDiscovery(text: string): DaemonDiscovery | null {
    const fields = new Map<string, string>();
    for (const line of text.split('\n')) {
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        const separator = line.indexOf('=');
        if (separator <= 0) {
            continue;
        }
        fields.set(line.slice(0, separator), line.slice(separator + 1));
    }
    const protocol = Number(fields.get('protocol'));
    const pid = Number(fields.get('pid'));
    const socket = fields.get('socket');
    const token = fields.get('token');
    const version = fields.get('version');
    if (!Number.isInteger(protocol) || !Number.isInteger(pid) || pid <= 0 || !socket || !token || version === undefined) {
        return null;
    }
    return { protocol, version, pid, socket, token };
}

export function readDiscovery(discoveryPath: string): DaemonDiscovery | null {
    try {
        return parseDiscovery(fs.readFileSync(discoveryPath, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Remove a discovery file that no live daemon owns. Guarded like the socket
 * hygiene in paths.ts: only a regular file owned by this user.
 */
function unlinkDiscoveryGuarded(discoveryPath: string): void {
    try {
        const stats = fs.lstatSync(discoveryPath);
        const uid = typeof process.getuid === 'function' ? process.getuid() : null;
        if (!stats.isFile() || (uid !== null && stats.uid !== uid)) {
            return;
        }
        fs.unlinkSync(discoveryPath);
    } catch {
        // Already gone.
    }
}

// ---------- health ----------

/**
 * GET /v1/health over the daemon's Unix socket, authenticated with the
 * discovery token. Resolves null on any failure — connect error, timeout,
 * non-200, malformed body — because for the lifecycle every one of those
 * means the same thing: this endpoint is not a ready compatible daemon.
 *
 * The bound is enforced by an external timer, not ClientRequest#setTimeout:
 * against a silent listener (a socket file someone else bound without an
 * HTTP server behind it) bun's request timeout does not fire on Linux, and
 * the probe would hang past its bound.
 */
function healthRequest(discovery: DaemonDiscovery, timeoutMs: number): Promise<DaemonHealth | null> {
    return new Promise((resolve) => {
        let settled = false;
        const timeout: { id?: NodeJS.Timeout } = {};
        const finish = (value: DaemonHealth | null): void => {
            if (settled) {
                return;
            }
            settled = true;
            if (timeout.id !== undefined) {
                clearTimeout(timeout.id);
            }
            resolve(value);
        };
        const request = http.request({
            socketPath: discovery.socket,
            method: 'GET',
            path: '/v1/health',
            headers: {
                authorization: `Bearer ${discovery.token}`,
                // One-shot probe: without this the agent pools the keep-alive
                // connection, and a later probe would be served over the old
                // socket without ever touching the (possibly replaced) path.
                connection: 'close'
            }
        }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => { chunks.push(chunk); });
            response.on('end', () => {
                if (response.statusCode !== 200) {
                    finish(null);
                    return;
                }
                try {
                    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as DaemonHealth;
                    if (typeof parsed.protocol === 'number' && typeof parsed.version === 'string' && typeof parsed.pid === 'number') {
                        finish(parsed);
                    } else {
                        finish(null);
                    }
                } catch {
                    finish(null);
                }
            });
            response.on('error', () => { finish(null); });
        });
        request.on('error', () => { finish(null); });
        timeout.id = setTimeout(() => {
            request.destroy();
            finish(null);
        }, timeoutMs);
        request.end();
    });
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

// ---------- startup lock ----------

interface LockInfo {
    pid: number;
    acquiredMs: number;
}

function getLockPath(runtimeDir: string): string {
    return path.join(runtimeDir, LOCK_FILE_NAME);
}

function readLockInfo(lockPath: string): LockInfo | null {
    try {
        const text = fs.readFileSync(lockPath, 'utf8');
        const pid = Number(/^pid=(\d+)$/m.exec(text)?.[1]);
        const acquiredMs = Date.parse(/^acquired=(.+)$/m.exec(text)?.[1] ?? '');
        if (!Number.isInteger(pid) || pid <= 0 || Number.isNaN(acquiredMs)) {
            return null;
        }
        return { pid, acquiredMs };
    } catch {
        return null;
    }
}

/**
 * Atomic per-user startup lock: O_EXCL create, so exactly one contender
 * wins. A lock whose owner died (crashed starter) or that overstayed its
 * age bound is evicted once; losing that eviction race means another
 * starter took over and this caller becomes a waiter.
 *
 * The file is created before its content is written, so the create→write
 * gap leaves it briefly unreadable — another starter would classify that
 * as stale and evict it. Ownership is therefore re-verified after the
 * write: if our lock did not survive to hold our pid, someone took over
 * and this caller converges as a waiter instead of spawning a second
 * server.
 */
function acquireStartupLock(runtimeDir: string, lockStaleMs: number): boolean {
    const lockPath = getLockPath(runtimeDir);
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const fd = fs.openSync(lockPath, 'wx', 0o600);
            fs.writeFileSync(fd, `pid=${process.pid}\nacquired=${new Date().toISOString()}\n`);
            fs.closeSync(fd);
            const info = readLockInfo(lockPath);
            return info !== null && info.pid === process.pid;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
            const info = readLockInfo(lockPath);
            const stale = info === null
                || !isPidAlive(info.pid)
                || Date.now() - info.acquiredMs > lockStaleMs;
            if (!stale) {
                return false;
            }
            try {
                fs.unlinkSync(lockPath);
            } catch {
                return false; // Raced eviction: the new owner's lock is there.
            }
        }
    }
    return false;
}

/** Remove the lock, but only if it is still ours (pid check in the content). */
function releaseStartupLock(runtimeDir: string): void {
    const lockPath = getLockPath(runtimeDir);
    const info = readLockInfo(lockPath);
    if (info?.pid !== process.pid) {
        return;
    }
    try {
        fs.unlinkSync(lockPath);
    } catch {
        // Already gone.
    }
}

// ---------- readiness ----------

interface ReadyDaemon {
    discovery: DaemonDiscovery;
    health: DaemonHealth;
}

/**
 * One probe: a daemon counts as ready only when its own health handshake
 * agrees with the discovery file (same pid, authenticated by its token) and
 * with this client build (protocol + version).
 */
async function probeCompatibleDaemon(discoveryPath: string, version: string, timings: LifecycleTimings): Promise<ReadyDaemon | null> {
    const discovery = readDiscovery(discoveryPath);
    if (discovery?.protocol !== PROTOCOL_VERSION) {
        return null;
    }
    const health = await healthRequest(discovery, timings.healthMs);
    if (health?.pid !== discovery.pid) {
        return null;
    }
    if (health.protocol !== PROTOCOL_VERSION || health.version !== version) {
        return null;
    }
    return { discovery, health };
}

/**
 * Poll for readiness until the deadline. Version/protocol mismatches are
 * not fatal here: the starter holding the lock may still be mid-upgrade
 * (old discovery still on disk), so a waiter just keeps waiting. The
 * timeout message carries what was last seen, so failure is explicit.
 */
async function awaitReadyDaemon(
    discoveryPath: string,
    version: string,
    deadline: number,
    timeoutMs: number,
    timings: LifecycleTimings,
    spawned?: SpawnedDaemon
): Promise<ReadyDaemon> {
    let lastSeen = 'no daemon discovery yet';
    let spawnExit = '';
    spawned?.once?.('exit', (code) => {
        spawnExit = `daemon process exited during startup (code ${code ?? 'signal'})`;
    });
    while (Date.now() < deadline) {
        if (spawnExit !== '') {
            throw new Error(spawnExit);
        }
        const ready = await probeCompatibleDaemon(discoveryPath, version, timings);
        if (ready !== null) {
            return ready;
        }
        const discovery = readDiscovery(discoveryPath);
        if (discovery !== null) {
            lastSeen = `protocol ${discovery.protocol}, version ${discovery.version}, pid ${discovery.pid}`;
        } else {
            lastSeen = 'no daemon discovery yet';
        }
        await delay(timings.pollMs);
    }
    throw new Error(`daemon did not become ready within ${timeoutMs}ms (last seen: ${lastSeen})`);
}

// ---------- verified stop ----------

/**
 * Signal a daemon whose identity is established (health answered on its
 * socket with the discovery pid, authenticated by the discovery token) and
 * wait, bounded, for it to release its endpoints. SIGTERM first; the
 * SIGKILL fallback re-establishes that identity right before the fatal
 * signal — the grace window is long enough for the pid to die and be
 * recycled, so a stale check from before SIGTERM is not enough.
 */
async function verifiedStop(
    discovery: DaemonDiscovery,
    discoveryPath: string,
    timings: LifecycleTimings,
    options: LifecycleOptions
): Promise<void> {
    const terminate = options.terminate ?? ((pid: number) => { process.kill(pid, 'SIGTERM'); });
    const kill = options.kill ?? ((pid: number) => { process.kill(pid, 'SIGKILL'); });

    // Released: the owner unlinked its discovery (graceful shutdown) or the
    // pid is gone (died on the signal — leftover files are ours to clean).
    const isReleased = (): boolean => {
        return !fs.existsSync(discoveryPath) || !isPidAlive(discovery.pid);
    };

    terminate(discovery.pid);
    const stopDeadline = Date.now() + timings.stopMs;
    while (Date.now() < stopDeadline) {
        if (isReleased()) {
            return;
        }
        await delay(timings.pollMs);
    }

    // Re-identify before the fatal signal. Nothing answering on the daemon's
    // authenticated socket means either a hung event loop or a recycled pid
    // — both are refused: signaling an unverified pid can kill an unrelated
    // process. The hung daemon is left running and named in the error so it
    // can be dealt with deliberately.
    const health = await healthRequest(discovery, timings.healthMs);
    if (health?.pid !== discovery.pid) {
        throw new Error(`daemon pid ${discovery.pid} survived SIGTERM and no longer answers as a ccstatusline daemon on ${discovery.socket}; refusing to SIGKILL an unverified process`);
    }
    try {
        kill(discovery.pid);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            throw error;
        }
    }
    const killDeadline = Date.now() + timings.killMs;
    while (Date.now() < killDeadline) {
        if (isReleased()) {
            // A killed process cannot clean up; drop the leftover discovery.
            unlinkDiscoveryGuarded(discoveryPath);
            return;
        }
        await delay(timings.pollMs);
    }
    throw new Error(`daemon pid ${discovery.pid} did not stop`);
}

// ---------- public lifecycle ----------

/** The IPC transport is Unix-socket only; every lifecycle entry refuses loudly. */
function assertIpcPlatform(): void {
    if (process.platform === 'win32') {
        throw new Error('daemon mode is not supported on Windows (Unix socket transport)');
    }
}

/**
 * Ensure exactly one daemon compatible with this client build is running.
 * Safe to call concurrently: contenders converge on the startup lock, and
 * the losers wait for the winner's server instead of spawning their own.
 * Recovers from crashed owners and stale discovery, and restarts an
 * incompatible (pre-upgrade) daemon after verifying its identity.
 */
export async function ensureDaemon(options: LifecycleOptions = {}): Promise<EnsureOutcome> {
    assertIpcPlatform();
    const runtimeDir = options.runtimeDir ?? getRuntimeDir();
    const version = options.currentVersion ?? getPackageVersion();
    const timings: LifecycleTimings = { ...DEFAULT_TIMINGS, ...options.timings };
    const discoveryPath = getDiscoveryPath(runtimeDir);

    ensureRuntimeDir(runtimeDir);

    const existing = await probeCompatibleDaemon(discoveryPath, version, timings);
    if (existing !== null) {
        return { state: 'already-running', pid: existing.health.pid, version: existing.health.version };
    }

    if (!acquireStartupLock(runtimeDir, timings.lockStaleMs)) {
        // Another starter holds the lock: converge on its server.
        const deadline = Date.now() + timings.startupMs;
        const ready = await awaitReadyDaemon(discoveryPath, version, deadline, timings.startupMs, timings);
        return { state: 'started', pid: ready.health.pid, version: ready.health.version };
    }

    let upgraded = false;
    try {
        // Double-check under the lock: a concurrent starter may have finished
        // between the fast path and the lock acquisition.
        const underLock = await probeCompatibleDaemon(discoveryPath, version, timings);
        if (underLock !== null) {
            return { state: 'already-running', pid: underLock.health.pid, version: underLock.health.version };
        }

        const stale = readDiscovery(discoveryPath);
        if (stale !== null) {
            const health = await healthRequest(stale, timings.healthMs);
            if (health !== null) {
                if (health.pid !== stale.pid) {
                    throw new Error(`identity mismatch: discovery names pid ${stale.pid} but the daemon on ${stale.socket} reports pid ${health.pid}`);
                }
                // Alive but incompatible: verified upgrade restart.
                await verifiedStop(stale, discoveryPath, timings, options);
                upgraded = true;
            }
            // Dead owner: stale discovery from a crashed or killed daemon.
            unlinkDiscoveryGuarded(discoveryPath);
        }

        const spawned = spawnDetachedDaemon(options);
        const ready = await awaitReadyDaemon(discoveryPath, version, Date.now() + timings.startupMs, timings.startupMs, timings, spawned);
        return { state: upgraded ? 'restarted' : 'started', pid: ready.health.pid, version: ready.health.version };
    } finally {
        releaseStartupLock(runtimeDir);
    }
}

/**
 * Spawn the daemon host detached so it outlives this process. The child is
 * this same entry in `daemon serve` mode; the config path is passed explicitly so
 * a custom --config on the parent survives the splice in main().
 */
function spawnDetachedDaemon(options: LifecycleOptions): SpawnedDaemon | undefined {
    if (options.spawnDaemon) {
        return options.spawnDaemon() ?? undefined;
    }
    const entry = options.daemonEntry ?? process.argv[1];
    if (!entry) {
        throw new Error('cannot determine the ccstatusline entry point to start the daemon');
    }
    const child: ChildProcess = spawn(
        process.execPath,
        [entry, '--config', getConfigPath(), 'daemon', 'serve'],
        { detached: true, stdio: 'ignore' }
    );
    child.unref();
    return child;
}

/**
 * Stop the running daemon. The pid is signaled only after positive identity
 * (health handshake on the discovery socket); anything else is stale state
 * that gets cleaned up, never signaled — a discovery pid that is alive but
 * not answering is treated as a recycled pid and left alone.
 */
export async function stopDaemon(options: LifecycleOptions = {}): Promise<StopOutcome> {
    assertIpcPlatform();
    const runtimeDir = options.runtimeDir ?? getRuntimeDir();
    const timings: LifecycleTimings = { ...DEFAULT_TIMINGS, ...options.timings };
    const discoveryPath = getDiscoveryPath(runtimeDir);

    const discovery = readDiscovery(discoveryPath);
    if (discovery === null) {
        return { state: 'not-running' };
    }
    const health = await healthRequest(discovery, timings.healthMs);
    if (health === null) {
        // A live pid that does not answer is treated as a recycled pid: it
        // is never signaled, and the discovery is left for `ensureDaemon`
        // to replace — unlinking it would strand a hung-but-alive server.
        if (isPidAlive(discovery.pid)) {
            return { state: 'not-running', detail: `pid ${discovery.pid} is alive but does not answer as a ccstatusline daemon; not signaled` };
        }
        unlinkDiscoveryGuarded(discoveryPath);
        return { state: 'not-running', detail: `stale discovery removed (pid ${discovery.pid} is gone)` };
    }
    if (health.pid !== discovery.pid) {
        throw new Error(`identity mismatch: discovery names pid ${discovery.pid} but the daemon on ${discovery.socket} reports pid ${health.pid}; refusing to stop`);
    }
    await verifiedStop(discovery, discoveryPath, timings, options);
    return { state: 'stopped', pid: discovery.pid };
}

/**
 * Report daemon state without changing anything. `running` means a healthy
 * daemon compatible with this client build; an alive server on a different
 * build is reported as `incompatible`, never as running.
 */
export async function daemonStatus(options: LifecycleOptions = {}): Promise<StatusOutcome> {
    assertIpcPlatform();
    const runtimeDir = options.runtimeDir ?? getRuntimeDir();
    const version = options.currentVersion ?? getPackageVersion();
    const timings: LifecycleTimings = { ...DEFAULT_TIMINGS, ...options.timings };
    const discoveryPath = getDiscoveryPath(runtimeDir);

    const discovery = readDiscovery(discoveryPath);
    if (discovery === null) {
        return { state: 'stopped' };
    }
    const health = await healthRequest(discovery, timings.healthMs);
    if (health === null) {
        return { state: 'stale', detail: `discovery at ${discoveryPath} points to pid ${discovery.pid} which does not answer` };
    }
    if (health.pid !== discovery.pid) {
        return { state: 'stale', detail: `socket reports pid ${health.pid} but discovery names pid ${discovery.pid}` };
    }
    if (health.protocol !== PROTOCOL_VERSION || health.version !== version) {
        return { state: 'incompatible', pid: health.pid, version: health.version, protocol: health.protocol, expectedVersion: version };
    }
    return {
        state: 'running',
        pid: health.pid,
        version: health.version,
        protocol: health.protocol,
        startedAt: readStartedAt(discoveryPath),
        runtime: health.runtime,
        uptimeSeconds: health.uptimeSeconds,
        lastRenderMs: health.lastRenderMs,
        activeRenders: health.activeRenders,
        counters: health.counters
    };
}

function readStartedAt(discoveryPath: string): string | undefined {
    try {
        return /^started=(.+)$/m.exec(fs.readFileSync(discoveryPath, 'utf8'))?.[1];
    } catch {
        return undefined;
    }
}

// ---------- CLI ----------

/** Compact human uptime: 42s, 5m12s, 2h03m, 3d4h (#19 status UX). */
function formatUptime(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h${String(minutes % 60).padStart(2, '0')}m`;
    }
    return `${Math.floor(hours / 24)}d${hours % 24}h`;
}

function formatCounters(counters: Record<string, number> | undefined): string {
    if (!counters) {
        return '';
    }
    const order = ['ok', 'deduped', 'render_failed', 'busy', 'unauthorized', 'bad_request'];
    const names = [...order, ...Object.keys(counters).filter(name => !order.includes(name))];
    const parts = names.filter(name => counters[name] !== undefined).map(name => `${name}=${counters[name]}`);
    return parts.length > 0 ? `, renders ${parts.join(' ')}` : '';
}

/**
 * `ccstatusline daemon [start|stop|status|restart|install|uninstall]` (#17,
 * #19). Bare `daemon` prints usage; `daemon serve` is the foreground server
 * host from #16 (spawned detached by `daemon start`).
 */
export async function runDaemonCommand(): Promise<void> {
    const daemonArgIndex = process.argv.indexOf('daemon');
    const subcommand = process.argv[daemonArgIndex + 1] ?? '';

    if (subcommand === '') {
        console.error('usage: ccstatusline daemon [start|stop|status|restart|install|uninstall]');
        process.exit(1);
    }

    if (subcommand === 'serve') {
        const { runDaemonServer } = await import('./server');
        await runDaemonServer();
        return;
    }

    try {
        if (subcommand === 'start') {
            const outcome = await ensureDaemon();
            if (outcome.state === 'already-running') {
                console.log(`daemon already running (pid ${outcome.pid}, version ${outcome.version})`);
            } else {
                console.log(`daemon ${outcome.state} (pid ${outcome.pid}, version ${outcome.version})`);
            }
            return;
        }
        if (subcommand === 'stop') {
            const outcome = await stopDaemon();
            if (outcome.state === 'stopped') {
                console.log(`daemon stopped (pid ${outcome.pid})`);
            } else {
                console.log(`daemon not running${outcome.detail ? ` (${outcome.detail})` : ''}`);
            }
            return;
        }
        if (subcommand === 'status') {
            const outcome = await daemonStatus();
            if (outcome.state === 'running') {
                const started = outcome.startedAt ? `, started ${outcome.startedAt}` : '';
                const uptime = outcome.uptimeSeconds !== undefined ? `, uptime ${formatUptime(outcome.uptimeSeconds)}` : '';
                const lastRender = outcome.lastRenderMs !== undefined && outcome.lastRenderMs !== null ? `, last render ${outcome.lastRenderMs}ms` : '';
                const active = outcome.activeRenders !== undefined ? `, active ${outcome.activeRenders}` : '';
                console.log(`daemon running (pid ${outcome.pid}, version ${outcome.version}, protocol ${outcome.protocol}${uptime}${started}${lastRender}${active}${formatCounters(outcome.counters)})`);
                return;
            }
            if (outcome.state === 'stopped') {
                console.log('daemon not running');
            } else if (outcome.state === 'stale') {
                console.log(`daemon stale: ${outcome.detail}`);
            } else {
                console.log(`daemon incompatible: running version ${outcome.version} (protocol ${outcome.protocol}, pid ${outcome.pid}), client build is ${outcome.expectedVersion}; run 'ccstatusline daemon restart'`);
            }
            process.exit(1);
        }
        if (subcommand === 'restart') {
            const stopped = await stopDaemon();
            const outcome = await ensureDaemon();
            const stoppedPart = stopped.state === 'stopped' ? `stopped pid ${stopped.pid}, ` : '';
            console.log(`daemon restarted (${stoppedPart}now pid ${outcome.pid}, version ${outcome.version})`);
            return;
        }
        if (subcommand === 'install') {
            // Explicit opt-in (#19): switching the status line to the shared
            // IPC client happens only here — never from the render path. The
            // daemon itself is started on purpose, after the wrapper command
            // is recorded.
            const { disableSharedMode, enableSharedMode } = await import('../utils/claude-settings');
            const enabled = await enableSharedMode();
            if (!enabled.statusLineWritten && enabled.reason !== 'shared mode is already active') {
                console.error(`ccstatusline daemon install: ${enabled.reason}`);
                process.exit(1);
            }
            let outcome;
            try {
                outcome = await ensureDaemon();
            } catch (error) {
                // The status line already points at the wrapper and is dark
                // until a daemon runs: when this run did the switch, roll it
                // back so the user is not stranded on a dead status line. If
                // shared mode was already active, keep it (a rollback would
                // erase the remembered one-shot command) and say what failed.
                if (enabled.statusLineWritten) {
                    const rolledBack = await disableSharedMode();
                    const rollbackPart = rolledBack.statusLineRestored ? 'one-shot status line restored; ' : '';
                    throw new Error(`${error instanceof Error ? error.message : String(error)} (${rollbackPart}the status line was not switched; run 'ccstatusline daemon start' to try again)`, { cause: error });
                }
                throw new Error(`${error instanceof Error ? error.message : String(error)} (the status line still points at the shared-mode client; run 'ccstatusline daemon start' or 'daemon uninstall')`, { cause: error });
            }
            const wrapperPart = enabled.wrapperPath ? `\n  statusLine command: sh ${enabled.wrapperPath}` : '';
            console.log(`shared mode on${wrapperPart}\ndaemon ${outcome.state === 'already-running' ? 'already running' : outcome.state} (pid ${outcome.pid}, version ${outcome.version})`);
            return;
        }
        if (subcommand === 'uninstall') {
            const { disableSharedMode } = await import('../utils/claude-settings');
            const disabled = await disableSharedMode();
            // The daemon only goes down when the restore actually happened:
            // stopping it on a refusal would darken a status line that still
            // points at the wrapper.
            const stopped = disabled.statusLineRestored ? await stopDaemon() : null;
            if (disabled.statusLineRestored) {
                console.log('shared mode off; one-shot status line restored');
            } else if (disabled.reason === 'shared mode was not enabled') {
                console.log(`shared mode off (nothing to restore: ${disabled.reason})`);
            } else {
                console.error(`ccstatusline daemon uninstall: ${disabled.reason}; the status line still points at the shared-mode client`);
                process.exit(1);
            }
            if (stopped?.state === 'stopped') {
                console.log(`daemon stopped (pid ${stopped.pid})`);
            } else if (stopped?.detail) {
                console.log(`daemon not running (${stopped.detail})`);
            }
            return;
        }
        console.error(`unknown daemon subcommand '${subcommand}'; usage: ccstatusline daemon [start|stop|status|restart|install|uninstall]`);
        process.exit(1);
    } catch (error) {
        console.error(`ccstatusline daemon ${subcommand}: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
