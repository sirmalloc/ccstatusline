import * as fs from 'node:fs';
import * as http from 'node:http';

import { renderStatusLines } from '../render';
import type { RenderInvocation } from '../types/RenderContext';
import type { StatusJSON } from '../types/StatusJSON';
import { StatusJSONSchema } from '../types/StatusJSON';
import type { LoadedSettings } from '../utils/config';
import {
    getConfigPath,
    loadSettingsFrom
} from '../utils/config';
import { clearCustomCommandCache } from '../utils/custom-command';
import { clearGitCache } from '../utils/git';
import { clearJjCommandLog } from '../utils/jj';
import { clearTranscriptAnalysisCache } from '../utils/jsonl-metrics';
import {
    getPackageVersion,
    getTerminalWidth
} from '../utils/terminal';

import {
    ensureRuntimeDir,
    getDiscoveryPath,
    getRuntimeDir,
    getSocketPath,
    prepareSocketPath,
    sweepStaleSockets
} from './paths';
import type { PrefetchState } from './prefetch';
import {
    createPrefetchState,
    prefetchRenderData
} from './prefetch';
import type { InvocationContext } from './protocol';
import {
    AUTH_SCHEME,
    CONTEXT_HEADER,
    ENV_ALLOWLIST,
    MAX_BODY_BYTES,
    MAX_IN_FLIGHT_RENDERS,
    PROTOCOL_VERSION,
    decodeContext,
    makeToken,
    tokensMatch
} from './protocol';

// Private IPC transport for the shared background renderer (#16): Node's
// built-in http server over a per-user Unix socket. No TCP listener, no web
// framework. Requests are authenticated with a bearer token published only
// through the 0600 discovery file in the 0700 runtime directory, so another
// user can neither connect to the socket nor read the token.
//
// Renders run concurrently (#18): the render path resolves everything through
// the per-request invocation snapshot (env/cwd) and prefetched provider data,
// so no process-global state is swapped. Requests with the exact same display
// context (config path + env + cwd + width + payload) join one in-flight
// render instead of repeating the work, and each client connection holds a
// consumer slot — the last one leaving cancels the provider work that only it
// still needed.

export interface DaemonDependencies {
    loadSettings: (configPath: string) => Promise<LoadedSettings>;
    resolveTerminalWidth: (sessionId: string | undefined, ttlSeconds: number, env: NodeJS.ProcessEnv) => number | null;
    buildInvocation: (context: InvocationContext, terminalWidth: number | null, env: NodeJS.ProcessEnv) => RenderInvocation;
}

export interface DaemonServerOptions {
    dependencies: DaemonDependencies;
    maxInFlightRenders?: number;
    /** Test seam (#17): reported build identity in health and the discovery file. */
    versionOverride?: string;
    /**
     * Idle auto-stop (#53): exit after this many milliseconds with zero
     * requests (any request, health included, resets the clock). 0 disables.
     */
    idleStopMs?: number;
    /** Called after the idle stop shut the server down (the host exits here). */
    onIdleStop?: () => void;
}

export interface DaemonCounters {
    requests: number;
    ok: number;
    [errorCode: string]: number;
}

export interface DaemonServerHandle {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    readonly socketPath: string;
    readonly discoveryPath: string;
    readonly runtimeDir: string;
    readonly token: string;
    readonly counters: DaemonCounters;
}

class BodyTooLargeError extends Error {
    constructor() {
        super('request body exceeds the size limit');
    }
}

/**
 * Apply the allowlisted request env on top of the daemon's own environment:
 * names present in the snapshot are set, names absent from it are cleared —
 * that is what preserves absent-vs-empty across the IPC boundary. Everything
 * outside the allowlist stays the daemon's, so spawned providers always have
 * PATH/HOME. Pure: returns a fresh object, never touches process.env (#18).
 */
export function mergeRequestEnvironment(context: InvocationContext): NodeJS.ProcessEnv {
    const merged: NodeJS.ProcessEnv = { ...process.env };
    for (const name of ENV_ALLOWLIST) {
        const value = context.env[name];
        if (value === undefined) {
            Reflect.deleteProperty(merged, name);
        } else {
            merged[name] = value;
        }
    }
    return merged;
}

/** Production dependencies: request-scoped wiring for the --serve loop. */
export function createProcessDaemonDependencies(): DaemonDependencies {
    return {
        loadSettings: configPath => loadSettingsFrom(configPath),
        resolveTerminalWidth: (sessionId, ttlSeconds, env) => {
            // The env snapshot carries CCSTATUSLINE_WIDTH/COLUMNS per request;
            // without an explicit width the shared memoized probe answers
            // (the daemon's own ancestry is stable for the process lifetime).
            return getTerminalWidth({ sessionId, ttlSeconds, env });
        },
        buildInvocation: (context, terminalWidth, env) => ({
            configPath: getConfigPath(),
            cwd: context.cwd ?? process.cwd(),
            env,
            terminalWidth
        })
    };
}

interface RenderJob {
    controller: AbortController;
    consumers: number;
    promise: Promise<string>;
}

// How long the daemon must see no requests before provider caches are
// reclaimed (#18). Bounded caches cap steady-state growth; the idle sweep
// gives the memory back after quiet periods.
const IDLE_SWEEP_INTERVAL_MS = 60_000;
const IDLE_SWEEP_AFTER_MS = 5 * 60_000;
/** Default idle auto-stop (#53): 10 minutes with zero requests. */
export const DEFAULT_IDLE_STOP_MS = 10 * 60_000;

function sweepProviderCaches(): void {
    clearGitCache();
    clearJjCommandLog();
    clearCustomCommandCache();
    clearTranscriptAnalysisCache();
}

export function createDaemonServer(options: DaemonServerOptions): DaemonServerHandle {
    const { dependencies } = options;
    const maxInFlight = options.maxInFlightRenders ?? MAX_IN_FLIGHT_RENDERS;
    const reportedVersion = options.versionOverride ?? getPackageVersion();

    const runtimeDir = getRuntimeDir();
    const socketPath = getSocketPath(runtimeDir);
    const discoveryPath = getDiscoveryPath(runtimeDir);
    const token = makeToken();
    const startedAt = new Date();

    const counters: DaemonCounters = { requests: 0, ok: 0 };
    let lastRenderMs: number | null = null;
    let lastActivityAt = Date.now();

    const prefetchState: PrefetchState = createPrefetchState();
    const renderJobs = new Map<string, RenderJob>();

    const idleStopMs = options.idleStopMs ?? DEFAULT_IDLE_STOP_MS;
    // The sweep cadence adapts to a short idle bound so tests (and tiny
    // configured values) do not wait a full minute for the first check.
    const idleCheckIntervalMs = idleStopMs > 0
        ? Math.min(IDLE_SWEEP_INTERVAL_MS, Math.max(100, Math.floor(idleStopMs / 5)))
        : IDLE_SWEEP_INTERVAL_MS;
    let idleStopPending = false;
    const idleSweeper = setInterval(() => {
        const idleFor = Date.now() - lastActivityAt;
        if (idleFor > IDLE_SWEEP_AFTER_MS && renderJobs.size === 0) {
            sweepProviderCaches();
            for (const cache of prefetchState.usageCaches.values()) {
                cache.data = null;
                cache.identity = undefined;
            }
        }
        // Idle auto-stop (#53): zero requests for the whole window and no
        // render in flight — the daemon takes itself down. Busy periods keep
        // it alive for free: every request bumps lastActivityAt.
        if (idleStopMs > 0 && !idleStopPending && idleFor > idleStopMs && renderJobs.size === 0) {
            idleStopPending = true;
            clearInterval(idleSweeper);
            void stopServer().then(() => { options.onIdleStop?.(); });
        }
    }, idleCheckIntervalMs);
    idleSweeper.unref();

    /** Join an in-flight render for `key`, or start one. */
    function scheduleRender(key: string, run: (signal: AbortSignal) => Promise<string>): { promise: Promise<string>; release: () => void } {
        const existing = renderJobs.get(key);
        if (existing && !existing.controller.signal.aborted) {
            existing.consumers++;
            counters.deduped = (counters.deduped ?? 0) + 1;
            return {
                promise: existing.promise,
                release: () => { releaseRender(key, existing); }
            };
        }

        const controller = new AbortController();
        const basePromise = run(controller.signal);
        const job: RenderJob = {
            controller,
            consumers: 1,
            promise: basePromise.finally(() => {
                if (renderJobs.get(key) === job) {
                    renderJobs.delete(key);
                }
            })
        };
        renderJobs.set(key, job);
        return {
            promise: job.promise,
            release: () => { releaseRender(key, job); }
        };
    }

    function releaseRender(key: string, job: RenderJob): void {
        if (job.consumers > 0) {
            job.consumers--;
        }
        // Zero consumers before completion: nobody will read the result, so
        // the provider work backing this render is cancelled. The job stays
        // registered until its promise settles (it still occupies an
        // in-flight slot while finishing).
        if (job.consumers === 0 && renderJobs.get(key) === job) {
            job.controller.abort();
        }
    }

    async function renderOne(data: StatusJSON, context: InvocationContext, signal: AbortSignal): Promise<string> {
        const env = mergeRequestEnvironment(context);
        const loaded = await dependencies.loadSettings(getConfigPath());
        const terminalWidth = dependencies.resolveTerminalWidth(
            data.session_id,
            loaded.settings.terminalWidthCacheTtlSeconds,
            env
        );
        const invocation = dependencies.buildInvocation(context, terminalWidth, env);

        const prefetch = await prefetchRenderData(data, loaded.settings, {
            env,
            cwd: invocation.cwd,
            terminalWidth,
            signal,
            state: prefetchState
        });

        const { text } = await renderStatusLines(data, loaded, invocation, prefetch);
        return text;
    }

    const server = http.createServer((request, response) => {
        void handleRequest(request, response).catch((error: unknown) => {
            console.error('ccstatusline daemon: request handler failed:', error instanceof Error ? error.message : error);
            if (!response.headersSent) {
                fail(response, 500, 'internal');
            } else {
                response.destroy();
            }
        });
    });
    // Malformed HTTP (e.g. a probe writing garbage at the socket) must not
    // get the default clientError reply, which writes to raw sockets.
    server.on('clientError', (_error, socket) => {
        socket.destroy();
    });

    function sendJson(response: http.ServerResponse, status: number, payload: object): void {
        const body = JSON.stringify(payload);
        response.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': Buffer.byteLength(body)
        });
        response.end(body);
    }

    function sendText(response: http.ServerResponse, status: number, text: string): void {
        response.writeHead(status, {
            'content-type': 'text/plain; charset=utf-8',
            'content-length': Buffer.byteLength(text)
        });
        response.end(text);
    }

    function bump(code: string): void {
        counters[code] = (counters[code] ?? 0) + 1;
    }

    function fail(response: http.ServerResponse, status: number, code: string, message?: string): void {
        bump(code);
        sendJson(response, status, message === undefined ? { error: { code } } : { error: { code, message } });
    }

    function isAuthorized(request: http.IncomingMessage): boolean {
        const header = request.headers.authorization;
        if (typeof header !== 'string') {
            return false;
        }
        const separator = header.indexOf(' ');
        if (separator === -1) {
            return false;
        }
        if (header.slice(0, separator).toLowerCase() !== AUTH_SCHEME) {
            return false;
        }
        return tokensMatch(token, header.slice(separator + 1).trim());
    }

    function requestPath(request: http.IncomingMessage): string {
        return (request.url ?? '').split('?')[0] ?? '';
    }

    async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
        counters.requests++;
        lastActivityAt = Date.now();

        if (!isAuthorized(request)) {
            fail(response, 401, 'unauthorized');
            return;
        }

        const pathname = requestPath(request);
        if (pathname === '/v1/health') {
            if (request.method !== 'GET') {
                fail(response, 405, 'method_not_allowed');
                return;
            }
            bump('ok');
            sendJson(response, 200, {
                protocol: PROTOCOL_VERSION,
                version: reportedVersion,
                pid: process.pid,
                runtime: process.version,
                startedAt: startedAt.toISOString(),
                uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
                lastRenderMs,
                activeRenders: renderJobs.size,
                counters
            });
            return;
        }

        if (pathname === '/v1/render') {
            if (request.method !== 'POST') {
                fail(response, 405, 'method_not_allowed');
                return;
            }
            await handleRender(request, response);
            return;
        }

        fail(response, 404, 'not_found');
    }

    async function readBodyCapped(request: http.IncomingMessage): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let size = 0;
            request.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_BODY_BYTES) {
                    // Do not destroy the socket: the 413 reply must reach the
                    // client, which then stops uploading on its own.
                    reject(new BodyTooLargeError());
                    return;
                }
                chunks.push(chunk);
            });
            request.on('end', () => { resolve(Buffer.concat(chunks)); });
            request.on('error', () => { reject(new Error('request aborted')); });
        });
    }

    async function handleRender(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
        let body: Buffer;
        try {
            body = await readBodyCapped(request);
        } catch (error) {
            if (error instanceof BodyTooLargeError) {
                fail(response, 413, 'too_large', `request body exceeds ${MAX_BODY_BYTES} bytes`);
            } else {
                fail(response, 400, 'bad_request', 'request aborted');
            }
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(body.toString('utf8'));
        } catch (error) {
            fail(response, 400, 'bad_request', `invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        const statusResult = StatusJSONSchema.safeParse(parsed);
        if (!statusResult.success) {
            fail(response, 400, 'bad_request', 'invalid status JSON');
            return;
        }

        const context: InvocationContext = { env: {}, cwd: null };
        const header = request.headers[CONTEXT_HEADER];
        const contextValue = Array.isArray(header) ? header[0] : header;
        if (contextValue !== undefined) {
            const decoded = decodeContext(contextValue);
            if (!decoded.ok) {
                fail(response, 400, 'bad_context', decoded.error);
                return;
            }
            Object.assign(context, decoded.context);
        }
        if (context.cwd !== null) {
            // Boundary validation before any work: the render reads it.
            try {
                if (!fs.statSync(context.cwd).isDirectory()) {
                    throw new Error('not a directory');
                }
            } catch {
                fail(response, 400, 'bad_context', `context cwd does not exist: ${context.cwd}`);
                return;
            }
        }

        if (renderJobs.size >= maxInFlight) {
            fail(response, 503, 'busy', 'render queue is full');
            return;
        }

        // Exact display context (#18): identical (config, env, cwd, width,
        // payload) requests join the in-flight render and receive its text.
        const env = mergeRequestEnvironment(context);
        const terminalWidth = getTerminalWidth({ env });
        const renderKey = JSON.stringify([
            getConfigPath(),
            Object.entries(env).filter(([name]) => (ENV_ALLOWLIST as readonly string[]).includes(name)),
            context.cwd,
            terminalWidth,
            JSON.stringify(statusResult.data)
        ]);

        let release: (() => void) | undefined;
        let settled = false;
        const onClientGone = () => {
            // The client stopped waiting (repaint superseded, Claude Code
            // restarted): release the consumer slot; the last one out cancels
            // provider work nobody else needs. Node fires request 'close' on
            // premature client disconnects; bun (1.3) surfaces nothing until
            // the first write, so there the release happens only at settle —
            // acceptable, the work was already done by then.
            release?.();
        };
        request.on('close', () => {
            if (!settled) {
                onClientGone();
            }
        });

        try {
            const startedAtRender = Date.now();
            const scheduled = scheduleRender(renderKey, signal => renderOneWithSignal(statusResult.data, context, signal));
            release = scheduled.release;
            const text = await scheduled.promise;
            settled = true;
            lastRenderMs = Date.now() - startedAtRender;
            bump('ok');
            sendText(response, 200, text);
        } catch (error) {
            settled = true;
            fail(response, 500, 'render_failed', error instanceof Error ? error.message : String(error));
        }
    }

    /** renderOne with the request's cancellation signal wired into prefetch. */
    function renderOneWithSignal(data: StatusJSON, context: InvocationContext, signal: AbortSignal): Promise<string> {
        return renderOne(data, context, signal);
    }

    function writeDiscoveryFile(): void {
        const lines = [
            '# ccstatusline daemon discovery v1 — one KEY=VALUE per line, safe to parse with a POSIX shell',
            `protocol=${PROTOCOL_VERSION}`,
            `version=${reportedVersion}`,
            `pid=${process.pid}`,
            `socket=${socketPath}`,
            `token=${token}`,
            `started=${startedAt.toISOString()}`
        ];
        const tempPath = `${discoveryPath}.${process.pid}.tmp`;
        fs.writeFileSync(tempPath, `${lines.join('\n')}\n`, { mode: 0o600 });
        fs.renameSync(tempPath, discoveryPath);
    }

    async function stopServer(): Promise<void> {
        clearInterval(idleSweeper);
        await new Promise<void>((resolve) => {
            server.closeIdleConnections();
            server.close(() => { resolve(); });
        });
        // Remove the endpoints only if this instance still owns them:
        // prepareSocketPath lets a same-user daemon take over the socket
        // path, and the takeover rewrites the discovery file in the same
        // breath. A superseded instance shutting down must not delete the
        // live one's socket or discovery. (Inode comparison is not an
        // option: the freed inode is routinely reused by the new socket.)
        let owned = false;
        try {
            owned = fs.readFileSync(discoveryPath, 'utf8').includes(`token=${token}\n`);
        } catch {
            // Gone already; nothing to clean up either way.
        }
        if (owned) {
            for (const stalePath of [socketPath, discoveryPath]) {
                try {
                    fs.unlinkSync(stalePath);
                } catch {
                    // Already gone.
                }
            }
        }
        try {
            fs.unlinkSync(`${discoveryPath}.${process.pid}.tmp`);
        } catch {
            // Already gone.
        }
    }

    return {
        socketPath,
        discoveryPath,
        runtimeDir,
        token,
        counters,
        async start(): Promise<void> {
            ensureRuntimeDir(runtimeDir);
            sweepStaleSockets(runtimeDir);
            prepareSocketPath(socketPath);
            await new Promise<void>((resolve, reject) => {
                const onError = (error: Error) => {
                    server.removeListener('listening', onListening);
                    reject(error);
                };
                const onListening = () => {
                    server.removeListener('error', onError);
                    resolve();
                };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen({ path: socketPath });
            });
            // listen() honors the umask; pin the socket so only this user connects.
            fs.chmodSync(socketPath, 0o600);
            writeDiscoveryFile();
        },
        stop: stopServer
    };
}

/**
 * Daemon host entry (`ccstatusline daemon`, #16): starts the transport and
 * blocks until SIGINT/SIGTERM or the idle auto-stop (#53). The bearer token is
 * never logged — it is shared only through the discovery file.
 */
export async function runDaemonServer(): Promise<void> {
    if (process.platform === 'win32') {
        console.error('ccstatusline daemon: not supported on Windows (Unix socket transport)');
        process.exit(1);
    }

    const daemon = createDaemonServer({
        dependencies: createProcessDaemonDependencies(),
        // Idle auto-stop (#53): the configured minutes with zero requests end
        // the process; an unreadable config keeps the 10-minute default.
        idleStopMs: (await loadSettingsFrom(getConfigPath())).settings.daemonIdleStopMinutes * 60_000,
        onIdleStop: () => {
            console.error('ccstatusline daemon: idle timeout reached, shutting down');
            process.exit(0);
        }
    });
    try {
        await daemon.start();
    } catch (error) {
        console.error(`ccstatusline daemon failed to start: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }

    console.error(`ccstatusline daemon listening on ${daemon.socketPath} (pid ${process.pid})`);

    let stopping = false;
    const shutdown = (signal: string) => {
        if (stopping) {
            return;
        }
        stopping = true;
        console.error(`ccstatusline daemon: received ${signal}, shutting down`);
        void daemon.stop().then(() => process.exit(0));
    };
    process.on('SIGINT', () => { shutdown('SIGINT'); });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });
}
