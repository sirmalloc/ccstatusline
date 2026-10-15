import * as fs from 'node:fs';
import * as net from 'node:net';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import { getSocketPath } from '../paths';
import type { InvocationContext } from '../protocol';
import { encodeContext } from '../protocol';

import type { StartedTestDaemon } from './test-daemon';
import {
    daemonRequest,
    renderRequest,
    startTestDaemon,
    stopTestDaemon,
    waitFor
} from './test-daemon';

const started: StartedTestDaemon[] = [];

async function start(overrides = {}, options: { maxInFlightRenders?: number } = {}): Promise<StartedTestDaemon> {
    const handle = await startTestDaemon(overrides, options);
    started.push(handle);
    return handle;
}

afterEach(async () => {
    for (const handle of started.splice(0)) {
        await stopTestDaemon(handle);
    }
});

describe('daemon server transport', () => {
    it('renders a valid status payload over the Unix socket', async () => {
        const { daemon } = await start();

        const response = await renderRequest(daemon, daemon.token);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.text).toContain('claude-daemon-test');
        expect(response.text.endsWith('\n')).toBe(false);
    });

    it('returns an empty 200 body when the render produces no output', async () => {
        const { daemon } = await start({
            loadSettings: () => import('../../types/Settings').then(({ DEFAULT_SETTINGS }) => ({
                settings: { ...DEFAULT_SETTINGS, lines: [] },
                loadError: null
            }))
        });

        const response = await renderRequest(daemon, daemon.token);

        expect(response.status).toBe(200);
        expect(response.text).toBe('');
    });

    it('rejects requests without or with a wrong bearer token', async () => {
        const { daemon } = await start();

        const noAuth = await daemonRequest(daemon, {
            method: 'POST',
            requestPath: '/v1/render',
            body: JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' })
        });
        expect(noAuth.status).toBe(401);
        const noAuthError = JSON.parse(noAuth.text) as { error: { code: string } };
        expect(noAuthError.error.code).toBe('unauthorized');

        const wrongToken = await renderRequest(daemon, 'f'.repeat(64));
        expect(wrongToken.status).toBe(401);

        const wrongScheme = await daemonRequest(daemon, {
            method: 'POST',
            requestPath: '/v1/render',
            body: '{}',
            token: daemon.token,
            headers: { authorization: `Basic ${daemon.token}` }
        });
        expect(wrongScheme.status).toBe(401);
    });

    it('answers health with protocol identity, counters, and no secrets', async () => {
        const { daemon } = await start();

        const response = await daemonRequest(daemon, { method: 'GET', requestPath: '/v1/health', token: daemon.token });
        const payload = JSON.parse(response.text) as {
            protocol: number;
            pid: number;
            counters: Record<string, number>;
        };

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/json');
        expect(payload.protocol).toBe(1);
        expect(payload.pid).toBe(process.pid);
        expect(payload.counters.requests).toBeGreaterThan(0);

        // Diagnostics must never carry credentials or the environment snapshot.
        expect(payload).not.toHaveProperty('token');
        expect(JSON.stringify(payload)).not.toContain(daemon.token);
        expect(JSON.stringify(payload)).not.toContain('CLAUDE_CONFIG_DIR');
    });

    it('rejects invalid and oversized requests before rendering', async () => {
        const { daemon } = await start();

        const badJson = await renderRequest(daemon, daemon.token, '{not json');
        expect(badJson.status).toBe(400);
        const badJsonError = JSON.parse(badJson.text) as { error: { code: string } };
        expect(badJsonError.error.code).toBe('bad_request');

        const schemaInvalid = await renderRequest(daemon, daemon.token, JSON.stringify({ model: 42 }));
        expect(schemaInvalid.status).toBe(400);

        const oversized = await renderRequest(daemon, daemon.token, `x${'y'.repeat(1024 * 1024)}`);
        expect(oversized.status).toBe(413);
        const oversizedError = JSON.parse(oversized.text) as { error: { code: string } };
        expect(oversizedError.error.code).toBe('too_large');

        const notFound = await daemonRequest(daemon, { method: 'GET', requestPath: '/v1/nope', token: daemon.token });
        expect(notFound.status).toBe(404);

        const wrongMethod = await daemonRequest(daemon, { method: 'GET', requestPath: '/v1/render', token: daemon.token });
        expect(wrongMethod.status).toBe(405);
    });

    it('rejects unknown env names and an invalid cwd in the context header', async () => {
        const { daemon } = await start();

        const smuggled = Buffer.from('NODE_OPTIONS=--inspect\0', 'utf8').toString('base64');
        const contextRejected = await daemonRequest(daemon, {
            method: 'POST',
            requestPath: '/v1/render',
            body: JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' }),
            token: daemon.token,
            headers: { 'x-ccstatusline-context': smuggled }
        });
        expect(contextRejected.status).toBe(400);
        const contextError = JSON.parse(contextRejected.text) as { error: { code: string } };
        expect(contextError.error.code).toBe('bad_context');

        const relativeCwd = Buffer.from('cwd=relative/path\0', 'utf8').toString('base64');
        const cwdRejected = await daemonRequest(daemon, {
            method: 'POST',
            requestPath: '/v1/render',
            body: JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' }),
            token: daemon.token,
            headers: { 'x-ccstatusline-context': relativeCwd }
        });
        expect(cwdRejected.status).toBe(400);

        const missingCwd = encodeContext({ env: {}, cwd: '/nonexistent-ccsd-cwd' });
        const existsRejected = await daemonRequest(daemon, {
            method: 'POST',
            requestPath: '/v1/render',
            body: JSON.stringify({ model: { id: 'm' }, cwd: '/tmp' }),
            token: daemon.token,
            headers: { 'x-ccstatusline-context': missingCwd }
        });
        expect(existsRejected.status).toBe(400);
    });

    it('applies the invocation context for the render and restores process state after', async () => {
        const previousWidth = process.env.CCSTATUSLINE_WIDTH;
        process.env.CCSTATUSLINE_WIDTH = '77';
        try {
            const { daemon, dependencies } = await start();

            const context: InvocationContext = {
                env: { CLAUDE_CONFIG_DIR: '/ccsd-config', COLUMNS: '150' },
                cwd: daemon.runtimeDir
            };
            const response = await daemonRequest(daemon, {
                method: 'POST',
                requestPath: '/v1/render',
                body: JSON.stringify({ model: { id: 'claude-daemon-test' }, cwd: '/tmp' }),
                token: daemon.token,
                headers: { 'x-ccstatusline-context': encodeContext(context) }
            });

            expect(response.status).toBe(200);

            const invocation = dependencies.invocations.at(-1);
            expect(invocation).toBeDefined();
            // Snapshot values are visible on the render path...
            expect(invocation?.env.CLAUDE_CONFIG_DIR).toBe('/ccsd-config');
            expect(invocation?.env.COLUMNS).toBe('150');
            // ...absent allowlisted names are cleared rather than leaking the daemon's...
            expect(invocation?.env.CCSTATUSLINE_WIDTH).toBeUndefined();
            expect(invocation?.cwd).toBe(daemon.runtimeDir);
            expect(invocation?.terminalWidth).toBe(120);

            // ...and the daemon's own process state is restored afterwards.
            expect(process.env.CCSTATUSLINE_WIDTH).toBe('77');
            expect(process.cwd()).not.toBe(daemon.runtimeDir);
        } finally {
            if (previousWidth === undefined) {
                delete process.env.CCSTATUSLINE_WIDTH;
            } else {
                process.env.CCSTATUSLINE_WIDTH = previousWidth;
            }
        }
    });

    it('answers 503 when the render queue is full', async () => {
        let releaseFirst: (() => void) | undefined;
        let loadCalls = 0;
        const gate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const { daemon } = await start({
            loadSettings: () => {
                loadCalls++;
                if (loadCalls === 1) {
                    return gate.then(() => import('../../types/Settings').then(({ DEFAULT_SETTINGS }) => ({
                        settings: { ...DEFAULT_SETTINGS, lines: [[{ id: 'model', type: 'model' }]] },
                        loadError: null
                    })));
                }
                return import('../../types/Settings').then(({ DEFAULT_SETTINGS }) => ({
                    settings: { ...DEFAULT_SETTINGS, lines: [[{ id: 'model', type: 'model' }]] },
                    loadError: null
                }));
            }
        }, { maxInFlightRenders: 1 });

        const body = JSON.stringify({ model: { id: 'claude-daemon-test' }, cwd: '/tmp' });
        const first = renderRequest(daemon, daemon.token, body);
        await waitFor(() => loadCalls === 1);

        const rejected = await renderRequest(daemon, daemon.token, body);
        expect(rejected.status).toBe(503);
        const rejectedError = JSON.parse(rejected.text) as { error: { code: string } };
        expect(rejectedError.error.code).toBe('busy');

        releaseFirst?.();
        const unblocked = await first;
        expect(unblocked.status).toBe(200);
    });

    it('publishes a 0600 discovery file and a 0600 socket, and cleans both up on stop', async () => {
        const handle = await start();
        const { daemon } = handle;

        const discoveryStats = fs.statSync(daemon.discoveryPath);
        expect(discoveryStats.mode & 0o777).toBe(0o600);
        const socketStats = fs.lstatSync(daemon.socketPath);
        expect(socketStats.mode & 0o777).toBe(0o600);
        expect(socketStats.isSocket()).toBe(true);

        const discovery = fs.readFileSync(daemon.discoveryPath, 'utf8');
        const fields = new Map<string, string>(
            discovery.trim().split('\n')
                .filter(line => line !== '' && !line.startsWith('#'))
                .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
        );
        expect(fields.get('protocol')).toBe('1');
        expect(fields.get('socket')).toBe(daemon.socketPath);
        expect(fields.get('token')).toBe(daemon.token);
        expect(fields.get('pid')).toBe(String(process.pid));

        await stopTestDaemon(handle);
        expect(fs.existsSync(daemon.socketPath)).toBe(false);
        expect(fs.existsSync(daemon.discoveryPath)).toBe(false);
    });

    it('does not delete endpoints taken over by a second daemon', async () => {
        const handle = await start();
        const first = handle.daemon;

        // Simulate a takeover: another daemon pid owns a different instance
        // socket in the same runtime dir, and the discovery file now points
        // at it with a fresh token. (Real takeovers run in another process —
        // instance paths are pid-suffixed — so a second in-process server
        // would fight the same bind path, not reproduce the takeover.)
        const takeoverSocket = getSocketPath(handle.runtimeDir, 424242);
        const takeoverServer = net.createServer();
        await new Promise<void>(resolve => takeoverServer.listen({ path: takeoverSocket }, resolve));
        fs.writeFileSync(handle.daemon.discoveryPath, [
            'protocol=1',
            `socket=${takeoverSocket}`,
            `token=${'b'.repeat(64)}`
        ].join('\n') + '\n', { mode: 0o600 });

        // Stopping the superseded instance must leave the live one intact.
        await first.stop();
        expect(fs.existsSync(takeoverSocket)).toBe(true);
        expect(fs.existsSync(handle.daemon.discoveryPath)).toBe(true);

        takeoverServer.close();
        fs.rmSync(takeoverSocket, { force: true });
    });
});
