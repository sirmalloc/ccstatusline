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

// Upstream e8ef3cb: the usage request carries the account's OAuth token, and
// a user who keeps api.anthropic.com off a proxy (NO_PROXY) still had it sent
// through HTTPS_PROXY — for example through a TLS-inspecting corporate one.

describe('upstream e8ef3cb: NO_PROXY keeps the usage request off the proxy', () => {
    let probe: ProbeHandle;

    beforeEach(() => {
        probe = createProbe();
    });

    afterEach(() => {
        cleanupProbe(probe);
    });

    it('does not configure a proxy agent for a NO_PROXY-excluded host', () => {
        const result = runUsageProbe(probe, {
            observe: true,
            httpsProxy: 'http://127.0.0.1:9',
            noProxy: 'api.anthropic.com'
        });

        expect(result.calls).toBeGreaterThan(0);
        expect(result.agentPresent.every(present => !present)).toBe(true);
    });

    it('still configures the proxy agent when NO_PROXY does not exclude the host', () => {
        const result = runUsageProbe(probe, {
            observe: true,
            httpsProxy: 'http://127.0.0.1:9',
            noProxy: 'example.com'
        });

        expect(result.calls).toBeGreaterThan(0);
        expect(result.agentPresent.some(present => present)).toBe(true);
    });

    it('honors the lowercase no_proxy spelling', () => {
        const result = runUsageProbe(probe, {
            observe: true,
            httpsProxy: 'http://127.0.0.1:9',
            lowercaseNoProxy: 'anthropic.com'
        });

        expect(result.calls).toBeGreaterThan(0);
        expect(result.agentPresent.every(present => !present)).toBe(true);
    });
});
