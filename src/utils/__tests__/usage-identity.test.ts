import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll,
    describe,
    expect,
    it
} from 'vitest';

// Identity gating for the shared daemon usage cache (#18), probed in child
// processes (same harness style as usage-fetch.test.ts): each probe is a
// fresh module registry with its own fake HOME, so the on-disk usage cache
// under ~/.cache/ccstatusline is sandboxed and the account switch scenarios
// share one in-process memory cache.

interface IdentityProbeResult {
    homedir: string;
    scopeKeys: { a: string; b: string };
    requestCounts: number[];
    lastData: { error?: string; sessionUsage?: number };
}

const usageModulePath = fileURLToPath(new URL('../usage-fetch.ts', import.meta.url));

// The CJS binding: bun's ESM execFileSync binding drops its return value here.
const realExecFileSync = (
    createRequire(import.meta.url)('child_process') as { execFileSync: (file: string, args: readonly string[], options: { encoding: string; env: NodeJS.ProcessEnv }) => string }
).execFileSync;

function createIdentityHarness() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-usage-identity-'));
    const probeScriptPath = path.join(tempRoot, 'probe-usage-identity.mjs');
    let probeCounter = 0;

    const probeScript = `
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const https = require('https');
const scenario = process.env.IDENTITY_SCENARIO;
let requestCount = 0;

https.request = (...args) => {
    requestCount += 1;
    const callback = args.find(value => typeof value === 'function');
    const responseHandlers = new Map();
    const response = {
        statusCode: 200,
        headers: {},
        setEncoding() {},
        on(event, handler) {
            const existing = responseHandlers.get(event) || [];
            existing.push(handler);
            responseHandlers.set(event, existing);
            return response;
        }
    };
    const request = {
        on() { return request; },
        destroy() {},
        end() {
            if (callback) {
                callback(response);
            }
            const body = JSON.stringify({
                five_hour: { utilization: 10, resets_at: '2030-01-01T00:00:00.000Z' },
                seven_day: { utilization: 20, resets_at: '2030-01-02T00:00:00.000Z' }
            });
            for (const handler of responseHandlers.get('data') || []) {
                handler(body);
            }
            for (const handler of responseHandlers.get('end') || []) {
                handler();
            }
        }
    };
    return request;
};

const { fetchUsageData, createUsageMemoryCache, getUsageScopeKey } = await import(${JSON.stringify(usageModulePath)});

const ACCOUNT_A = { accessToken: 'a-access', refreshToken: 'a-refresh' };
const ACCOUNT_B = { accessToken: 'b-access', refreshToken: 'b-refresh' };
const emptyConfigDir = path.join(os.homedir(), 'empty-config');
fs.mkdirSync(emptyConfigDir, { recursive: true });
const emptyEnv = { CLAUDE_CONFIG_DIR: emptyConfigDir };

const sharedCache = createUsageMemoryCache();
const run = (account) => fetchUsageData({
    requiredFields: ['sessionUsage'],
    cache: sharedCache,
    resolveCredentials: () => Promise.resolve(account),
    env: emptyEnv
});

const requestCounts = [];
let lastData = null;
if (scenario === 'memory') {
    const sequence = [ACCOUNT_A, ACCOUNT_A, ACCOUNT_B, ACCOUNT_A, null, null];
    for (const account of sequence) {
        lastData = await run(account);
        requestCounts.push(requestCount);
    }
} else {
    // file scenario: prime under B, then read as A with a fresh memory cache
    lastData = await run(ACCOUNT_B);
    requestCounts.push(requestCount);
    lastData = await run(ACCOUNT_A);
    requestCounts.push(requestCount);
}

process.stdout.write(JSON.stringify({
    homedir: os.homedir(),
    scopeKeys: { a: getUsageScopeKey(ACCOUNT_A), b: getUsageScopeKey(ACCOUNT_B) },
    requestCounts,
    lastData: { ...(lastData.error ? { error: lastData.error } : {}), ...(lastData.sessionUsage !== undefined ? { sessionUsage: lastData.sessionUsage } : {}) }
}));
`;

    fs.writeFileSync(probeScriptPath, probeScript);

    function runProbe(scenario: 'memory' | 'file'): IdentityProbeResult {
        probeCounter += 1;
        const home = path.join(tempRoot, `home-${scenario}-${probeCounter}`);
        fs.mkdirSync(home, { recursive: true });
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
            const normalizedKey = key.toUpperCase();
            return normalizedKey !== 'CLAUDE_CONFIG_DIR' && normalizedKey !== 'HTTPS_PROXY';
        }));
        Object.assign(env, { HOME: home, USERPROFILE: home, PATH: '/nonexistent', IDENTITY_SCENARIO: scenario });

        const output = realExecFileSync(process.execPath, [probeScriptPath], { encoding: 'utf8', env });
        let result: IdentityProbeResult;
        try {
            result = JSON.parse(output) as IdentityProbeResult;
        } catch {
            throw new Error(`probe output was not JSON: ${output.slice(0, 500)}`);
        }

        // A probe resolving a different home has escaped its sandbox and would
        // read or write the real user's ~/.cache/ccstatusline
        expect(result.homedir).toBe(home);

        return result;
    }

    return {
        runProbe,
        cleanup: (): void => {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    };
}

const harness = createIdentityHarness();

afterAll(() => {
    harness.cleanup();
});

describe('usage cache identity gating (#18)', () => {
    it('fingerprints differ per account', () => {
        const probe = harness.runProbe('memory');
        expect(probe.scopeKeys.a).not.toBe(probe.scopeKeys.b);
    });

    it('never serves another account\'s entry and refetches on account switch', () => {
        const probe = harness.runProbe('memory');
        // Sequence A, A, B, A, none, none:
        expect(probe.requestCounts).toEqual([1, 1, 2, 3, 3, 3]);
    });

    it('does not take the file cache of another account', () => {
        const probe = harness.runProbe('file');
        // First fetch (B) hits the API; the A fetch must not read B's entry.
        expect(probe.requestCounts).toEqual([1, 2]);
        expect(probe.lastData.sessionUsage).toBe(10);
    });
});
