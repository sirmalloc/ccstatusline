import { HttpsProxyAgent } from 'https-proxy-agent';
import { EventEmitter } from 'node:events';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { ClaudeIncidentWindow } from '../claude-service-status';
import {
    INCIDENT_HISTORY_BUCKET_COUNT,
    INCIDENT_HISTORY_BUCKET_MS,
    __testing,
    computeIncidentHistoryBuckets,
    getClaudeStatusFgCode,
    hasClaudeStatusWidgets,
    isClaudeStatusHistoryEnabled,
    parseClaudeIncidentsResponse,
    parseClaudeStatusResponse
} from '../claude-service-status';

type StatusPageRequestFn = NonNullable<Parameters<typeof __testing.fetchStatusPagePath>[1]>;

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse('2026-08-15T12:00:00Z');

// Tests set HTTPS_PROXY themselves; the environment running the suite must not leak in.
function isolateHttpsProxyEnv(): void {
    let original: string | undefined;

    beforeEach(() => {
        original = process.env.HTTPS_PROXY;
        delete process.env.HTTPS_PROXY;
    });

    afterEach(() => {
        if (original === undefined) {
            delete process.env.HTTPS_PROXY;
        } else {
            process.env.HTTPS_PROXY = original;
        }
    });
}

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
    isolateHttpsProxyEnv();

    // Streams the chunks as the response body, then ends it or fails it mid-stream.
    function respondingRequest(
        statusCode: number,
        chunks: string[],
        finalEvent: 'end' | 'aborted' | 'error' = 'end'
    ): StatusPageRequestFn {
        return (_options, onResponse) => Object.assign(new EventEmitter(), {
            destroy: () => undefined,
            end() {
                const response = Object.assign(new EventEmitter(), {
                    statusCode,
                    setEncoding: () => undefined
                });
                onResponse(response);
                for (const chunk of chunks) {
                    response.emit('data', chunk);
                }
                if (finalEvent === 'error') {
                    response.emit('error', new Error('response stream failed'));
                } else {
                    response.emit(finalEvent);
                }
            }
        });
    }

    function failingRequest(event: 'error' | 'timeout', onDestroy: () => void = () => undefined): StatusPageRequestFn {
        return () => {
            const request = Object.assign(new EventEmitter(), {
                destroy() {
                    onDestroy();
                    // A real ClientRequest destroyed before any response reports a socket error.
                    request.emit('error', new Error('socket hang up'));
                },
                end() {
                    if (event === 'error') {
                        request.emit('error', new Error('connect ECONNREFUSED'));
                    } else {
                        request.emit('timeout');
                    }
                }
            });

            return request;
        };
    }

    it.each(['aborted', 'error'] as const)('settles with null when the response emits %s', async (event) => {
        const result = await Promise.race([
            __testing.fetchStatusPagePath('/test', respondingRequest(200, ['partial response'], event)),
            new Promise<'timeout'>(resolve => setTimeout(() => { resolve('timeout'); }, 100))
        ]);

        expect(result).toBeNull();
    });

    it('returns the full body of a 200 response delivered in several chunks', async () => {
        const result = await __testing.fetchStatusPagePath('/test', respondingRequest(200, ['{"status":', '{"indicator":', '"minor"}}']));

        expect(result).toBe('{"status":{"indicator":"minor"}}');
    });

    it.each([
        ['a non-200 status', 503, ['<html>Service Unavailable</html>']],
        ['an empty 200 body', 200, []]
    ])('settles with null for %s', async (_label, statusCode, chunks) => {
        await expect(__testing.fetchStatusPagePath('/test', respondingRequest(statusCode, chunks))).resolves.toBeNull();
    });

    it('settles with null when the request fails before any response', async () => {
        await expect(__testing.fetchStatusPagePath('/test', failingRequest('error'))).resolves.toBeNull();
    });

    it('destroys a timed-out request and settles with null', async () => {
        const destroy = vi.fn();

        await expect(__testing.fetchStatusPagePath('/test', failingRequest('timeout', destroy))).resolves.toBeNull();
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('sends a GET for the path to status.claude.com with a 5 second timeout and no proxy agent by default', async () => {
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await __testing.fetchStatusPagePath('/api/v2/status.json', requestFn);

        expect(requestFn).toHaveBeenCalledTimes(1);
        expect(requestFn.mock.calls[0]?.[0]).toEqual({
            hostname: 'status.claude.com',
            path: '/api/v2/status.json',
            method: 'GET',
            timeout: 5000
        });
    });

    it('tunnels through the proxy named by HTTPS_PROXY', async () => {
        process.env.HTTPS_PROXY = 'http://proxy.example:8080';
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await __testing.fetchStatusPagePath('/test', requestFn);

        const agent = requestFn.mock.calls[0]?.[0].agent;
        expect(agent).toBeInstanceOf(HttpsProxyAgent);
        expect((agent as HttpsProxyAgent<string>).proxy.href).toBe('http://proxy.example:8080/');
    });

    it('ignores a whitespace-only HTTPS_PROXY', async () => {
        process.env.HTTPS_PROXY = '   ';
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await expect(__testing.fetchStatusPagePath('/test', requestFn)).resolves.toBe('{}');
        expect(requestFn.mock.calls[0]?.[0]).not.toHaveProperty('agent');
    });

    it('settles with null without sending a request when HTTPS_PROXY is not a valid URL', async () => {
        process.env.HTTPS_PROXY = 'not a proxy url';
        const requestFn = vi.fn(respondingRequest(200, ['{}']));

        await expect(__testing.fetchStatusPagePath('/test', requestFn)).resolves.toBeNull();
        expect(requestFn).not.toHaveBeenCalled();
    });
});

describe('getClaudeStatusFgCode', () => {
    it('uses the 16-color escapes as-is, with major falling back to red and critical to bright red', () => {
        expect(getClaudeStatusFgCode('major', 'ansi16')).toBe('\x1b[31m');
        expect(getClaudeStatusFgCode('critical', 'ansi16')).toBe('\x1b[91m');
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
