import { EventEmitter } from 'events';
import {
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
