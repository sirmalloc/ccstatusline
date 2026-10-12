import { createServer } from 'node:net';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    cleanupProbe,
    createProbe,
    runUsageProbe,
    type ProbeHandle
} from './usage-probe';

// Upstream 610dcc9: the usage request's `timeout` only covers an idle socket,
// and behind HTTPS_PROXY the request has no socket until the proxy answers
// CONNECT — a proxy that accepts and never answers held the render forever,
// and its agent kept the process alive afterwards. The fetch now has an
// absolute deadline that also closes the proxy agent.

const PROBE_BUDGET_MS = 20000;

describe('upstream 610dcc9: a stalled proxy cannot hold the render forever', () => {
    let probe: ProbeHandle;
    let stalledProxy: ReturnType<typeof createServer>;

    beforeEach(() => {
        probe = createProbe();
        // accepts the TCP connection and never responds: the CONNECT the proxy
        // agent waits for never arrives
        stalledProxy = createServer(() => undefined);
        stalledProxy.listen(0, '127.0.0.1');
    });

    afterEach(() => {
        stalledProxy.close();
        cleanupProbe(probe);
    });

    it('finishes the fetch against a proxy that never answers', async () => {
        // the fixed deadline itself is 5s; allow the probe process to boot and
        // the deadline to fire with margin, but far under the hang of the bug
        await new Promise<void>((resolve) => {
            if (stalledProxy.listening) {
                resolve();
                return;
            }
            stalledProxy.once('listening', resolve);
        });

        const address = stalledProxy.address();
        if (address === null || typeof address === 'string') {
            throw new Error('stalled proxy did not start');
        }

        const started = Date.now();
        const result = runUsageProbe(probe, {
            httpsProxy: `http://127.0.0.1:${address.port}`,
            timeoutMs: PROBE_BUDGET_MS
        });
        const elapsed = Date.now() - started;

        expect(elapsed).toBeLessThan(PROBE_BUDGET_MS);
        expect(result.resultKind).toBe('api-error');
    }, 25000);
});
