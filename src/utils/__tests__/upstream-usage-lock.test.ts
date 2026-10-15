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

// Upstream 0bcc7eb (#624): a successful fetch removed usage.lock
// unconditionally. When two renders fetch concurrently and one receives a 429,
// the other's later success deleted the rate-limit lock, and the next render
// fetched inside the server's backoff window. The clear is now conditional on
// the lock still holding this render's own in-flight record.

const SUCCESS_BODY = JSON.stringify({
    five_hour: {
        utilization: 42,
        resets_at: '2030-01-01T00:00:00.000Z'
    },
    seven_day: {
        utilization: 17,
        resets_at: '2030-01-07T00:00:00.000Z'
    }
});

describe('upstream 0bcc7eb: only the in-flight lock this render wrote is cleared', () => {
    let probe: ProbeHandle;

    beforeEach(() => {
        probe = createProbe();
    });

    afterEach(() => {
        cleanupProbe(probe);
    });

    it('does not clear a rate-limit lock a concurrent render wrote', () => {
        const rateLimitLock = JSON.stringify({ blockedUntil: Math.floor(Date.now() / 1000) + 60, error: 'rate-limited' });

        const result = runUsageProbe(probe, {
            observe: true,
            httpsProxy: 'http://127.0.0.1:9',
            responseBody: SUCCESS_BODY,
            lockDuringRequest: rateLimitLock
        });

        expect(result.lockExistsAfter).toBe(true);
        expect(result.lockContentsAfter).toBe(rateLimitLock);
    });
});
