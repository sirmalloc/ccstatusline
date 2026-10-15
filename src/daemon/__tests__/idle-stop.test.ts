import * as fs from 'node:fs';
import * as http from 'node:http';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type { StartedTestDaemon } from './test-daemon';
import {
    renderRequest,
    startTestDaemon,
    stopTestDaemon,
    waitFor
} from './test-daemon';

// Idle auto-stop (#53): after the configured window with zero requests the
// daemon takes itself down — endpoints released, onIdleStop fired (the host
// process exits there in production). Any request resets the clock, and 0
// disables the mechanism outright.

const started: StartedTestDaemon[] = [];

async function start(options: { idleStopMs?: number; onIdleStop?: () => void } = {}): Promise<StartedTestDaemon> {
    const handle = await startTestDaemon({}, options);
    started.push(handle);
    return handle;
}

afterEach(async () => {
    for (const handle of started.splice(0)) {
        await stopTestDaemon(handle);
    }
});

function socketAnswers(handle: StartedTestDaemon): Promise<boolean> {
    return new Promise((resolve) => {
        const request = http.request({ socketPath: handle.daemon.socketPath, method: 'GET', path: '/v1/health' });
        request.on('error', () => { resolve(false); });
        // Any response at all means something still serves the endpoint.
        request.on('response', () => { resolve(true); });
        request.end();
    });
}

describe('daemon idle auto-stop (#53)', () => {
    it('stops itself after the idle window with zero requests', async () => {
        let fired = false;
        const handle = await start({ idleStopMs: 300, onIdleStop: () => { fired = true; } });

        await waitFor(() => !fs.existsSync(handle.daemon.discoveryPath), 4000);

        expect(fired).toBe(true);
        expect(await socketAnswers(handle)).toBe(false);
    });

    it('a request keeps the daemon alive past the idle window', async () => {
        const handle = await start({ idleStopMs: 500 });

        // A render at t=300ms resets the idle clock; the daemon must still be
        // serving at t=650ms (past the original deadline) and stop only after
        // its own idle window restarts.
        await new Promise((resolve) => { setTimeout(resolve, 300); });
        const response = await renderRequest(handle.daemon, handle.daemon.token);
        expect(response.status).toBe(200);

        await new Promise((resolve) => { setTimeout(resolve, 350); });
        expect(fs.existsSync(handle.daemon.discoveryPath)).toBe(true);

        await waitFor(() => !fs.existsSync(handle.daemon.discoveryPath), 4000);
    });

    it('idleStopMs 0 disables the auto-stop', async () => {
        const handle = await start({ idleStopMs: 0 });

        await new Promise((resolve) => { setTimeout(resolve, 400); });

        expect(fs.existsSync(handle.daemon.discoveryPath)).toBe(true);
        const response = await renderRequest(handle.daemon, handle.daemon.token);
        expect(response.status).toBe(200);
    });
});
