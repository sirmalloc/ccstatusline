import type * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { ClaudeIncidentWindow } from '../claude-service-status';
import {
    INCIDENT_HISTORY_BUCKET_COUNT,
    INCIDENT_HISTORY_BUCKET_MS,
    __testing,
    computeIncidentHistoryBuckets,
    hasClaudeStatusWidgets,
    isClaudeStatusHistoryEnabled,
    parseClaudeIncidentsResponse,
    parseClaudeStatusResponse
} from '../claude-service-status';

const require = createRequire(import.meta.url);
const { execFile: realExecFile } = require('node:child_process') as { execFile: typeof childProcess.execFile };

type StatusPageRequestFn = NonNullable<Parameters<typeof __testing.fetchStatusPagePath>[1]>;

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse('2026-08-15T12:00:00Z');

function incident(impact: ClaudeIncidentWindow['impact'], startHoursAgo: number, endHoursAgo: number | null): ClaudeIncidentWindow {
    return {
        impact,
        startMs: NOW - startHoursAgo * HOUR_MS,
        endMs: endHoursAgo === null ? null : NOW - endHoursAgo * HOUR_MS
    };
}

describe('computeIncidentHistoryBuckets', () => {
    it('reports none for every bucket when there are no incidents', () => {
        expect(computeIncidentHistoryBuckets([], NOW)).toEqual([
            'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'
        ]);
    });

    it('colors every bucket an incident window overlaps', () => {
        // Active from 13h ago to 8h ago: overlaps the 18-12h and 12-6h buckets.
        const buckets = computeIncidentHistoryBuckets([incident('minor', 13, 8)], NOW);
        expect(buckets).toEqual([
            'none', 'none', 'none', 'none', 'none', 'minor', 'minor', 'none'
        ]);
    });

    it('keeps an unresolved incident active through the newest bucket', () => {
        const buckets = computeIncidentHistoryBuckets([incident('major', 4, null)], NOW);
        expect(buckets).toEqual([
            'none', 'none', 'none', 'none', 'none', 'none', 'none', 'major'
        ]);
    });

    it('picks the worst overlapping impact per bucket', () => {
        const buckets = computeIncidentHistoryBuckets([
            incident('minor', 5, 1),
            incident('critical', 3, 2),
            incident('major', 4, 3)
        ], NOW);
        expect(buckets[INCIDENT_HISTORY_BUCKET_COUNT - 1]).toBe('critical');
    });

    it('ignores incidents fully outside the 48h window', () => {
        const buckets = computeIncidentHistoryBuckets([incident('critical', 80, 60)], NOW);
        expect(buckets.every(bucket => bucket === 'none')).toBe(true);
    });

    it('does not treat a bucket-boundary touch as an overlap', () => {
        // Resolved exactly at the oldest bucket's start: no overlap.
        const boundary = NOW - INCIDENT_HISTORY_BUCKET_COUNT * INCIDENT_HISTORY_BUCKET_MS;
        const buckets = computeIncidentHistoryBuckets([{ impact: 'critical', startMs: boundary - HOUR_MS, endMs: boundary }], NOW);
        expect(buckets.every(bucket => bucket === 'none')).toBe(true);
    });

    it('supports custom bucket counts and sizes', () => {
        const buckets = computeIncidentHistoryBuckets([incident('minor', 1.5, null)], NOW, 4, HOUR_MS);
        expect(buckets).toEqual(['none', 'none', 'minor', 'minor']);
    });
});

describe('parseClaudeStatusResponse', () => {
    it('extracts the status indicator', () => {
        expect(parseClaudeStatusResponse('{"status":{"indicator":"minor","description":"Partially Degraded Service"}}')).toBe('minor');
    });

    it('returns null for malformed JSON or a missing indicator', () => {
        expect(parseClaudeStatusResponse('not json')).toBeNull();
        expect(parseClaudeStatusResponse('{"status":{}}')).toBeNull();
        expect(parseClaudeStatusResponse('{}')).toBeNull();
    });
});

describe('parseClaudeIncidentsResponse', () => {
    it('prefers started_at, falls back to created_at, and drops untracked impacts', () => {
        const raw = JSON.stringify({
            incidents: [
                {
                    impact: 'major',
                    started_at: '2026-08-14T22:00:00Z',
                    created_at: '2026-08-15T00:00:00Z',
                    resolved_at: '2026-08-15T02:00:00Z'
                },
                { impact: 'minor', created_at: '2026-08-15T03:00:00Z', resolved_at: null },
                { impact: 'none', created_at: '2026-08-15T04:00:00Z', resolved_at: '2026-08-15T05:00:00Z' },
                { impact: 'catastrophic', created_at: '2026-08-15T04:00:00Z', resolved_at: null }
            ]
        });

        expect(parseClaudeIncidentsResponse(raw)).toEqual([
            {
                impact: 'major',
                startMs: Date.parse('2026-08-14T22:00:00Z'),
                endMs: Date.parse('2026-08-15T02:00:00Z')
            },
            {
                impact: 'minor',
                startMs: Date.parse('2026-08-15T03:00:00Z'),
                endMs: null
            }
        ]);
    });

    it('falls back to created_at when started_at is malformed', () => {
        const raw = JSON.stringify({
            incidents: [{
                impact: 'critical',
                started_at: 'garbage',
                created_at: '2026-08-15T04:00:00Z',
                resolved_at: null
            }]
        });
        expect(parseClaudeIncidentsResponse(raw)).toEqual([{
            impact: 'critical',
            startMs: Date.parse('2026-08-15T04:00:00Z'),
            endMs: null
        }]);
    });

    it('drops incidents without a parseable start timestamp', () => {
        const raw = JSON.stringify({ incidents: [{ impact: 'critical', started_at: 'garbage', created_at: null, resolved_at: null }] });
        expect(parseClaudeIncidentsResponse(raw)).toEqual([]);
    });

    it('returns null for malformed JSON and an empty list for a missing incidents array', () => {
        expect(parseClaudeIncidentsResponse('not json')).toBeNull();
        expect(parseClaudeIncidentsResponse('{}')).toEqual([]);
    });
});

describe('status page response handling', () => {
    function responseFailureRequest(event: 'aborted' | 'error'): StatusPageRequestFn {
        return (_options, onResponse) => {
            const response = Object.assign(new EventEmitter(), {
                statusCode: 200,
                setEncoding: () => undefined
            });
            const request = Object.assign(new EventEmitter(), {
                destroy: () => undefined,
                end() {
                    onResponse(response);
                    response.emit('data', 'partial response');
                    if (event === 'error') {
                        response.emit('error', new Error('response stream failed'));
                    } else {
                        response.emit('aborted');
                    }
                }
            });

            return request;
        };
    }

    it.each(['aborted', 'error'] as const)('settles with null when the response emits %s', async (event) => {
        const result = await Promise.race([
            __testing.fetchStatusPagePath('/test', responseFailureRequest(event)),
            new Promise<'timeout'>(resolve => setTimeout(() => { resolve('timeout'); }, 100))
        ]);

        expect(result).toBeNull();
    });
});

describe('claude-status prefetch predicates', () => {
    it('detects claude-status widgets in configured lines', () => {
        expect(hasClaudeStatusWidgets([[{ id: '1', type: 'model' }]])).toBe(false);
        expect(hasClaudeStatusWidgets([[{ id: '1', type: 'model' }], [{ id: '2', type: 'claude-status' }]])).toBe(true);
    });

    it('only reports history enabled for claude-status items with the metadata flag', () => {
        expect(isClaudeStatusHistoryEnabled({ id: '1', type: 'claude-status' })).toBe(false);
        expect(isClaudeStatusHistoryEnabled({ id: '1', type: 'claude-status', metadata: { history: 'true' } })).toBe(true);
        expect(isClaudeStatusHistoryEnabled({ id: '1', type: 'custom-text', metadata: { history: 'true' } })).toBe(false);
    });
});

interface StatusProbeResult {
    result: Record<string, unknown>;
    requestCount: number;
    homedir: string;
}

// Runs prefetchClaudeStatusIfNeeded in a separate process against a faked
// https.request, so concurrent statusline sessions can be modelled as real
// processes sharing one ~/.cache/ccstatusline. With TEST_HOLD set, the fake
// request marks itself in flight and only answers once the release file exists.
function createStatusProbeHarness() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-status-test-'));
    const probeScriptPath = path.join(tempRoot, 'probe-status.mjs');
    const statusModulePath = fileURLToPath(new URL('../claude-service-status.ts', import.meta.url));
    const home = path.join(tempRoot, 'home');
    const cacheDir = path.join(home, '.cache', 'ccstatusline');
    const inFlightFile = path.join(tempRoot, 'in-flight');
    const releaseFile = path.join(tempRoot, 'release');
    fs.mkdirSync(cacheDir, { recursive: true });

    const probeScript = `
import * as fs from 'fs';
import * as os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const https = require('https');
const hold = process.env.TEST_HOLD === '1';
const indicator = process.env.TEST_INDICATOR || 'none';
let requestCount = 0;

https.request = (options, callback) => {
    requestCount += 1;
    const responseHandlers = new Map();
    const response = {
        statusCode: 200,
        setEncoding() {},
        on(event, handler) {
            responseHandlers.set(event, handler);
            return response;
        }
    };
    const respond = () => {
        callback(response);
        responseHandlers.get('data')?.(JSON.stringify({ status: { indicator } }));
        responseHandlers.get('end')?.();
    };
    const request = {
        on() { return request; },
        destroy() {},
        end() {
            if (!hold) {
                respond();
                return;
            }
            fs.writeFileSync(process.env.TEST_IN_FLIGHT_FILE, '');
            const timer = setInterval(() => {
                if (fs.existsSync(process.env.TEST_RELEASE_FILE)) {
                    clearInterval(timer);
                    respond();
                }
            }, 10);
        }
    };
    return request;
};

const { prefetchClaudeStatusIfNeeded } = await import(${JSON.stringify(statusModulePath)});
const result = await prefetchClaudeStatusIfNeeded([[{ id: 'status', type: 'claude-status' }]]);
process.stdout.write(JSON.stringify({ result, requestCount, homedir: os.homedir() }));
`;
    fs.writeFileSync(probeScriptPath, probeScript);

    function runProbe(options: { hold?: boolean; indicator?: string }): Promise<StatusProbeResult> {
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            TEST_HOLD: options.hold ? '1' : '0',
            TEST_INDICATOR: options.indicator ?? 'none',
            TEST_IN_FLIGHT_FILE: inFlightFile,
            TEST_RELEASE_FILE: releaseFile
        };
        delete env.HTTPS_PROXY;
        delete env.https_proxy;

        return new Promise((resolve, reject) => {
            realExecFile(process.execPath, [probeScriptPath], { encoding: 'utf8', env }, (error, stdout) => {
                if (error) {
                    reject(new Error(`status probe failed: ${error.message}`));
                    return;
                }
                const parsed = JSON.parse(stdout) as StatusProbeResult;
                // A probe resolving a different home has escaped its sandbox
                // and would touch the real user's ~/.cache/ccstatusline
                expect(parsed.homedir).toBe(home);
                resolve(parsed);
            });
        });
    }

    async function waitForInFlight(): Promise<void> {
        const deadline = Date.now() + 20000;
        while (!fs.existsSync(inFlightFile)) {
            if (Date.now() > deadline) {
                throw new Error('held status request never started');
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    return {
        cacheFile: path.join(cacheDir, 'claude-status.json'),
        lockFile: path.join(cacheDir, 'claude-status.lock'),
        cleanup: () => { fs.rmSync(tempRoot, { recursive: true, force: true }); },
        release: () => { fs.writeFileSync(releaseFile, ''); },
        runProbe,
        waitForInFlight
    };
}

describe('claude-status fetch lock across processes', () => {
    let harness: ReturnType<typeof createStatusProbeHarness>;

    beforeEach(() => {
        harness = createStatusProbeHarness();
        // An expired cache (older than the 300 s refresh interval)
        fs.writeFileSync(harness.cacheFile, JSON.stringify({
            fetchedAt: Date.now() - 400 * 1000,
            indicator: 'minor',
            incidents: null,
            incidentsQueried: false
        }));
    });

    afterEach(() => {
        harness.cleanup();
    });

    it('serves the expired cache instead of fetching while another process fetches', async () => {
        const first = harness.runProbe({ hold: true, indicator: 'none' });
        try {
            await harness.waitForInFlight();

            const concurrent = await harness.runProbe({ indicator: 'major' });
            expect(concurrent.requestCount).toBe(0);
            expect(concurrent.result).toEqual({ indicator: 'minor' });
        } finally {
            harness.release();
        }

        const firstResult = await first;
        expect(firstResult.requestCount).toBe(1);
        expect(firstResult.result).toEqual({ indicator: 'none' });
        // The fetching process removes its own in-flight lock on success
        expect(fs.existsSync(harness.lockFile)).toBe(false);
    }, 30000);

    it('keeps a failure lock another process wrote during its fetch', async () => {
        const first = harness.runProbe({ hold: true, indicator: 'none' });
        try {
            await harness.waitForInFlight();
            // A concurrent render failed and wrote its (empty) backoff lock
            fs.writeFileSync(harness.lockFile, '');
        } finally {
            harness.release();
        }

        const firstResult = await first;
        expect(firstResult.result).toEqual({ indicator: 'none' });
        expect(fs.readFileSync(harness.lockFile, 'utf8')).toBe('');
    }, 30000);

    it('still honours a legacy empty failure lock', async () => {
        fs.writeFileSync(harness.lockFile, '');

        const result = await harness.runProbe({ indicator: 'none' });
        expect(result.requestCount).toBe(0);
        expect(result.result).toEqual({ indicator: 'minor' });
    }, 30000);
});
