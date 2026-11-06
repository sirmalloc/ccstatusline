import type * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
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

import type { WidgetItem } from '../../types/Widget';

const require = createRequire(import.meta.url);
const { execFileSync: realExecFileSync } = require('node:child_process') as { execFileSync: typeof childProcess.execFileSync };

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const NOW = Date.parse('2026-08-15T12:00:00Z');

const STATUS_PATH = '/api/v2/status.json';
const INCIDENTS_PATH = '/api/v2/incidents.json';
const MAJOR_STATUS_BODY = '{"status":{"indicator":"major"}}';

const statusLine: WidgetItem[][] = [[{ id: '1', type: 'claude-status' }]];
const historyLine: WidgetItem[][] = [[{ id: '1', type: 'claude-status', metadata: { history: 'true' } }]];

interface ProbeOptions {
    lines?: WidgetItem[][];
    // An empty body makes that request fail, as when the page can't be reached
    statusBody?: string;
    incidentsBody?: string;
}

interface ProbeResult {
    result: Record<string, unknown> | null;
    requests: string[];
    homedir: string;
}

// The module resolves its cache paths from the home directory when it loads,
// so each probe imports it fresh in a child process with a scratch HOME.
function createProbeHarness() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-claude-status-test-'));
    const home = path.join(tempRoot, 'home');
    const cacheDir = path.join(home, '.cache', 'ccstatusline');
    const probeScriptPath = path.join(tempRoot, 'probe-claude-status.mjs');
    const modulePath = fileURLToPath(new URL('../claude-service-status.ts', import.meta.url));

    const probeScript = `
import * as os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const https = require('node:https');
const bodies = {
    ${JSON.stringify(STATUS_PATH)}: process.env.TEST_STATUS_BODY || '',
    ${JSON.stringify(INCIDENTS_PATH)}: process.env.TEST_INCIDENTS_BODY || ''
};
const requests = [];

https.request = (options, onResponse) => {
    requests.push(options.path);
    const body = bodies[options.path] || '';
    const requestHandlers = new Map();
    const request = {
        on(event, handler) {
            requestHandlers.set(event, handler);
            return request;
        },
        destroy() {},
        end() {
            if (!body) {
                requestHandlers.get('error')?.(new Error('connect ECONNREFUSED'));
                return;
            }
            const responseHandlers = new Map();
            const response = {
                statusCode: 200,
                setEncoding() {},
                on(event, handler) {
                    responseHandlers.set(event, handler);
                    return response;
                }
            };
            onResponse(response);
            responseHandlers.get('data')?.(body);
            responseHandlers.get('end')?.();
        }
    };
    return request;
};

const nowMs = Number(process.env.TEST_NOW_MS);
Date.now = () => nowMs;

const { prefetchClaudeStatusIfNeeded } = await import(${JSON.stringify(modulePath)});
const result = await prefetchClaudeStatusIfNeeded(JSON.parse(process.env.TEST_LINES_JSON));
process.stdout.write(JSON.stringify({ result, requests, homedir: os.homedir() }));
`;

    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(probeScriptPath, probeScript);

    function seedCache(contents: Record<string, unknown>): void {
        fs.writeFileSync(path.join(cacheDir, 'claude-status.json'), JSON.stringify(contents));
    }

    function seedFailureLock(mtimeMs: number): void {
        const lockFile = path.join(cacheDir, 'claude-status.lock');
        fs.writeFileSync(lockFile, '');
        fs.utimesSync(lockFile, mtimeMs / 1000, mtimeMs / 1000);
    }

    // Another process's claim on the fetch, as one left by a process that
    // stopped mid-fetch
    function seedFetchClaim(mtimeMs: number): void {
        const claimDir = path.join(cacheDir, 'claude-status.inflight');
        const owner = path.join(claimDir, 'other-process');
        fs.mkdirSync(claimDir);
        fs.writeFileSync(owner, '');
        fs.utimesSync(owner, mtimeMs / 1000, mtimeMs / 1000);
    }

    function runProbe(options: ProbeOptions = {}): ProbeResult {
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
            const normalizedKey = key.toUpperCase();
            return normalizedKey !== 'HTTPS_PROXY' && normalizedKey !== 'NO_PROXY';
        }));

        Object.assign(env, {
            HOME: home,
            // os.homedir() prefers USERPROFILE on Windows; inheriting the
            // real one lets the probe escape into the user's actual home
            USERPROFILE: home,
            TEST_LINES_JSON: JSON.stringify(options.lines ?? statusLine),
            TEST_NOW_MS: String(NOW),
            TEST_STATUS_BODY: options.statusBody ?? '',
            TEST_INCIDENTS_BODY: options.incidentsBody ?? ''
        });

        const output = realExecFileSync(process.execPath, [probeScriptPath], {
            encoding: 'utf8',
            env
        });
        const result = JSON.parse(output) as ProbeResult;

        // A probe resolving a different home has escaped its sandbox and would
        // read or write the real user's ~/.cache/ccstatusline
        expect(result.homedir).toBe(home);

        return result;
    }

    function cleanup(): void {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    return {
        cleanup,
        runProbe,
        seedCache,
        seedFailureLock,
        seedFetchClaim
    };
}

type ProbeHarness = ReturnType<typeof createProbeHarness>;

function cachedStatus(fetchedAt: number, indicator: string): Record<string, unknown> {
    return {
        fetchedAt,
        indicator,
        incidents: null,
        incidentsQueried: false
    };
}

describe('Claude Status cache', () => {
    let harness: ProbeHarness;

    beforeEach(() => {
        harness = createProbeHarness();
    });

    afterEach(() => {
        harness.cleanup();
    });

    it('serves a cache inside its five-minute lifetime without fetching', () => {
        harness.seedCache(cachedStatus(NOW - 2 * MINUTE_MS, 'none'));

        const probe = harness.runProbe({ statusBody: MAJOR_STATUS_BODY });

        expect(probe.requests).toEqual([]);
        expect(probe.result).toEqual({ indicator: 'none' });
    });

    // Two hours ahead: written while the system clock ran fast, since
    // corrected. A few seconds ahead: clocks a little apart.
    it.each([
        ['two hours', 2 * HOUR_MS, [STATUS_PATH], 'major'],
        ['a few seconds', 2 * SECOND_MS, [], 'none']
    ])('refetches a cache dated %s in the future only when the date cannot be right', (_label, aheadMs, expectedRequests, expectedIndicator) => {
        harness.seedCache(cachedStatus(NOW + aheadMs, 'none'));

        const probe = harness.runProbe({ statusBody: MAJOR_STATUS_BODY });

        expect(probe.requests).toEqual(expectedRequests);
        expect(probe.result).toEqual({ indicator: expectedIndicator });
    });

    it.each([
        ['ten seconds old', -10 * SECOND_MS, [], 'none'],
        ['dated a few seconds in the future', 2 * SECOND_MS, [], 'none'],
        ['dated two hours in the future', 2 * HOUR_MS, [STATUS_PATH], 'major']
    ])('backs off for a failure lock %s only while it can be current', (_label, lockOffsetMs, expectedRequests, expectedIndicator) => {
        harness.seedCache(cachedStatus(NOW - 10 * MINUTE_MS, 'none'));
        harness.seedFailureLock(NOW + lockOffsetMs);

        const probe = harness.runProbe({ statusBody: MAJOR_STATUS_BODY });

        expect(probe.requests).toEqual(expectedRequests);
        expect(probe.result).toEqual({ indicator: expectedIndicator });
    });

    it.each([
        ['ten seconds old', -10 * SECOND_MS, [], 'none'],
        ['dated a few seconds in the future', 2 * SECOND_MS, [], 'none'],
        ['dated two hours in the future', 2 * HOUR_MS, [STATUS_PATH], 'major']
    ])('leaves the fetch to another process whose claim is %s only while it can be current', (_label, claimOffsetMs, expectedRequests, expectedIndicator) => {
        harness.seedCache(cachedStatus(NOW - 10 * MINUTE_MS, 'none'));
        harness.seedFetchClaim(NOW + claimOffsetMs);

        const probe = harness.runProbe({ statusBody: MAJOR_STATUS_BODY });

        expect(probe.requests).toEqual(expectedRequests);
        expect(probe.result).toEqual({ indicator: expectedIndicator });
    });

    describe('while the status page is unreachable', () => {
        it('keeps serving the last status for up to an hour', () => {
            harness.seedCache(cachedStatus(NOW - 50 * MINUTE_MS, 'major'));

            const probe = harness.runProbe();

            expect(probe.requests).toEqual([STATUS_PATH]);
            expect(probe.result).toEqual({ indicator: 'major' });
        });

        it.each([
            ['the fetch fails', null, [STATUS_PATH]],
            ['the failure backoff holds off fetching', NOW - 10 * SECOND_MS, []]
        ])('reports the status unknown once the last one is over an hour old and %s', (_label, lockMtimeMs, expectedRequests) => {
            harness.seedCache(cachedStatus(NOW - 2 * HOUR_MS, 'major'));
            if (lockMtimeMs !== null) {
                harness.seedFailureLock(lockMtimeMs);
            }

            const probe = harness.runProbe();

            expect(probe.requests).toEqual(expectedRequests);
            expect(probe.result).toEqual({ error: true });
        });

        // Written while the system clock ran fast, since corrected: its age
        // can't be known, so it isn't served as the last status either
        it('reports the status unknown when the last one is dated hours in the future', () => {
            harness.seedCache(cachedStatus(NOW + 2 * HOUR_MS, 'none'));

            const probe = harness.runProbe();

            expect(probe.requests).toEqual([STATUS_PATH]);
            expect(probe.result).toEqual({ error: true });
        });

        it('stops an incident still open in a two-day-old cache from filling the history strip', () => {
            const fetchedAt = NOW - 48 * HOUR_MS;
            harness.seedCache({
                fetchedAt,
                indicator: 'major',
                incidents: [{ impact: 'critical', startMs: fetchedAt - HOUR_MS, endMs: null }],
                incidentsQueried: true
            });

            const probe = harness.runProbe({ lines: historyLine });

            expect(probe.requests).toEqual([STATUS_PATH, INCIDENTS_PATH]);
            expect(probe.result).toEqual({ error: true });
        });
    });
});
