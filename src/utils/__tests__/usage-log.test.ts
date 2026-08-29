import * as fs from 'fs';
import * as os from 'os';
import path from 'path';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { UsageTrackerConfig } from '../../types/Settings';
import {
    __testing,
    initUsageLog,
    logApiUsagePayload,
    logStdinRateLimits
} from '../usage-log';

const TEST_ROOT = '/tmp/ccstatusline-usage-log-test';
const LOG_PATH = path.join(TEST_ROOT, 'usage-log.jsonl');
const ROTATED_PATH = path.join(TEST_ROOT, 'usage-log.1.jsonl');
const STATE_PATH = path.join(TEST_ROOT, 'usage-log.state.json');
const ORIGINAL_XDG_DATA_HOME = process.env.XDG_DATA_HOME;

const SAMPLE_RATE_LIMITS = {
    five_hour: { used_percentage: 2, resets_at: 1785953400 },
    seven_day: { used_percentage: 30, resets_at: 1786276799 },
    mystery_bucket: { used_percentage: 7 }
};

function makeConfig(overrides: Partial<UsageTrackerConfig> = {}): UsageTrackerConfig {
    return {
        enabled: true,
        logApiUsage: true,
        logPath: LOG_PATH,
        heartbeatMinutes: 10,
        rotateMaxMb: 5,
        ...overrides
    };
}

function readLogRecords(logPath = LOG_PATH): Record<string, unknown>[] {
    if (!fs.existsSync(logPath)) {
        return [];
    }

    return fs.readFileSync(logPath, 'utf8')
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => JSON.parse(line) as Record<string, unknown>);
}

function readStateFile(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as Record<string, unknown>;
}

describe('usage-log', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        __testing.reset();
        fs.rmSync(TEST_ROOT, { recursive: true, force: true });
        fs.mkdirSync(TEST_ROOT, { recursive: true });
        delete process.env.XDG_DATA_HOME;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        __testing.reset();
    });

    afterAll(() => {
        fs.rmSync(TEST_ROOT, { recursive: true, force: true });
        if (ORIGINAL_XDG_DATA_HOME === undefined) {
            delete process.env.XDG_DATA_HOME;
        } else {
            process.env.XDG_DATA_HOME = ORIGINAL_XDG_DATA_HOME;
        }
    });

    describe('canonicalJson', () => {
        it('sorts object keys recursively', () => {
            const json = __testing.canonicalJson({
                b: 1,
                a: {
                    d: 2,
                    c: [3, { f: 4, e: 5 }]
                }
            });

            expect(json).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
        });

        it('keeps array order', () => {
            expect(__testing.canonicalJson([2, 1, { b: 0, a: 0 }])).toBe('[2,1,{"a":0,"b":0}]');
        });
    });

    describe('computeSignature', () => {
        it('is stable across object key ordering', () => {
            const a = __testing.computeSignature('acct', { x: 1, y: { b: 2, a: 3 } });
            const b = __testing.computeSignature('acct', { y: { a: 3, b: 2 }, x: 1 });

            expect(a).toBe(b);
            expect(a).toMatch(/^[0-9a-f]{16}$/);
        });

        it('changes when a value changes', () => {
            const a = __testing.computeSignature('acct', { used_percentage: 2 });
            const b = __testing.computeSignature('acct', { used_percentage: 3 });

            expect(a).not.toBe(b);
        });

        it('changes when the account changes', () => {
            const raw = { used_percentage: 2 };

            expect(__testing.computeSignature('acct-a', raw)).not.toBe(__testing.computeSignature('acct-b', raw));
            expect(__testing.computeSignature(undefined, raw)).not.toBe(__testing.computeSignature('acct-a', raw));
        });
    });

    describe('buildRecord', () => {
        it('builds a stdin record with truncated session id observation', () => {
            const record = __testing.buildRecord(
                'stdin',
                1785953662881,
                'a3f9c1d2e5b70614',
                SAMPLE_RATE_LIMITS,
                { sessionId: '237bc35a-1234-5678', modelId: 'claude-opus-5' }
            );

            expect(record).toEqual({
                v: 1,
                t: new Date(1785953662881).toISOString(),
                src: 'stdin',
                acct: 'a3f9c1d2e5b70614',
                raw: SAMPLE_RATE_LIMITS,
                obs: { sid: '237bc35a', model: 'claude-opus-5' }
            });
        });

        it('omits acct when unknown and obs when empty', () => {
            const record = __testing.buildRecord('stdin', 0, undefined, SAMPLE_RATE_LIMITS, {});

            expect(record).not.toHaveProperty('acct');
            expect(record).not.toHaveProperty('obs');
        });

        it('builds hb records without raw or obs', () => {
            const record = __testing.buildRecord('hb', 0, 'a3f9c1d2e5b70614', SAMPLE_RATE_LIMITS, { sessionId: 'x' });

            expect(record).toEqual({
                v: 1,
                t: '1970-01-01T00:00:00.000Z',
                src: 'hb',
                acct: 'a3f9c1d2e5b70614'
            });
        });
    });

    describe('path resolution', () => {
        it('uses XDG_DATA_HOME when set', () => {
            expect(__testing.resolveDataDir({ XDG_DATA_HOME: '/xdg/data' })).toBe(path.join('/xdg/data', 'ccstatusline'));
        });

        it('falls back to ~/.local/share when XDG_DATA_HOME is unset or blank', () => {
            const fallback = path.join(os.homedir(), '.local', 'share', 'ccstatusline');

            expect(__testing.resolveDataDir({})).toBe(fallback);
            expect(__testing.resolveDataDir({ XDG_DATA_HOME: '   ' })).toBe(fallback);
        });

        it('keeps the rotated and state files next to an overridden log path', () => {
            const paths = __testing.resolveLogPaths(makeConfig({ logPath: '/custom/dir/my-log.jsonl' }));

            expect(paths).toEqual({
                logPath: '/custom/dir/my-log.jsonl',
                rotatedPath: '/custom/dir/my-log.1.jsonl',
                statePath: '/custom/dir/my-log.state.json'
            });
        });

        it('derives default paths from the data dir', () => {
            process.env.XDG_DATA_HOME = TEST_ROOT;
            const paths = __testing.resolveLogPaths(makeConfig({ logPath: undefined }));

            expect(paths.logPath).toBe(path.join(TEST_ROOT, 'ccstatusline', 'usage-log.jsonl'));
            expect(paths.rotatedPath).toBe(path.join(TEST_ROOT, 'ccstatusline', 'usage-log.1.jsonl'));
            expect(paths.statePath).toBe(path.join(TEST_ROOT, 'ccstatusline', 'usage-log.state.json'));
        });
    });

    describe('logStdinRateLimits', () => {
        it('appends a lossless stdin record including unknown buckets', () => {
            initUsageLog(makeConfig(), { sessionId: '237bc35a-1234', modelId: 'claude-opus-5' });

            logStdinRateLimits({ ...SAMPLE_RATE_LIMITS, seven_day_opus: null });

            const records = readLogRecords();
            expect(records).toHaveLength(1);
            expect(records[0]?.src).toBe('stdin');
            expect(records[0]?.raw).toEqual({ ...SAMPLE_RATE_LIMITS, seven_day_opus: null });
            expect(records[0]?.obs).toEqual({ sid: '237bc35a', model: 'claude-opus-5' });
            expect(readStateFile()).toMatchObject({ v: 1, stdin: { sig: expect.any(String) as unknown } });
        });

        it('appends nothing when the signature is unchanged', () => {
            initUsageLog(makeConfig());

            logStdinRateLimits(SAMPLE_RATE_LIMITS);
            logStdinRateLimits({ ...SAMPLE_RATE_LIMITS });

            expect(readLogRecords()).toHaveLength(1);
        });

        it('appends a new record when a percentage changes', () => {
            initUsageLog(makeConfig());

            logStdinRateLimits(SAMPLE_RATE_LIMITS);
            logStdinRateLimits({
                ...SAMPLE_RATE_LIMITS,
                five_hour: { used_percentage: 3, resets_at: 1785953400 }
            });

            const records = readLogRecords();
            expect(records).toHaveLength(2);
            expect((records[1]?.raw as { five_hour: { used_percentage: number } }).five_hour.used_percentage).toBe(3);
        });

        it('does nothing when disabled or uninitialized', () => {
            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            initUsageLog(makeConfig({ enabled: false }));
            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            expect(fs.existsSync(LOG_PATH)).toBe(false);
            expect(fs.existsSync(STATE_PATH)).toBe(false);
        });

        it('appends a heartbeat when rate_limits is absent and nothing was ever logged', () => {
            initUsageLog(makeConfig(), { sessionId: 'should-not-appear' });

            logStdinRateLimits(undefined);

            const records = readLogRecords();
            expect(records).toHaveLength(1);
            expect(records[0]?.src).toBe('hb');
            expect(records[0]).not.toHaveProperty('raw');
            expect(records[0]).not.toHaveProperty('obs');
        });

        it('treats null rate_limits as absent', () => {
            initUsageLog(makeConfig());

            logStdinRateLimits(null);

            const records = readLogRecords();
            expect(records).toHaveLength(1);
            expect(records[0]?.src).toBe('hb');
        });

        it('suppresses heartbeats until heartbeatMinutes have passed since the last append', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_785_953_600_000);
            initUsageLog(makeConfig());

            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            // Shortly after the stdin record: unchanged signature, no heartbeat.
            nowSpy.mockReturnValue(1_785_953_600_000 + 60_000);
            logStdinRateLimits(SAMPLE_RATE_LIMITS);
            expect(readLogRecords()).toHaveLength(1);

            // Past the heartbeat interval: an hb record is appended.
            nowSpy.mockReturnValue(1_785_953_600_000 + 10 * 60_000);
            logStdinRateLimits(SAMPLE_RATE_LIMITS);
            const records = readLogRecords();
            expect(records).toHaveLength(2);
            expect(records[1]?.src).toBe('hb');

            // The heartbeat refreshed lastHbAt, so the next render is quiet again.
            nowSpy.mockReturnValue(1_785_953_600_000 + 10 * 60_000 + 60_000);
            logStdinRateLimits(SAMPLE_RATE_LIMITS);
            expect(readLogRecords()).toHaveLength(2);
        });

        it('treats a corrupt state file as no previous signature and rewrites it', () => {
            initUsageLog(makeConfig());
            logStdinRateLimits(SAMPLE_RATE_LIMITS);
            fs.writeFileSync(STATE_PATH, '{ not json');

            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            expect(readLogRecords()).toHaveLength(2);
            expect(readStateFile()).toMatchObject({ v: 1 });
        });

        it('swallows all errors when the log directory is unwritable', () => {
            if (process.getuid?.() === 0) {
                // Root ignores directory permissions; nothing to assert.
                return;
            }

            const lockedDir = path.join(TEST_ROOT, 'locked');
            fs.mkdirSync(lockedDir, { recursive: true });
            fs.chmodSync(lockedDir, 0o555);
            initUsageLog(makeConfig({ logPath: path.join(lockedDir, 'usage-log.jsonl') }));

            try {
                expect(() => { logStdinRateLimits(SAMPLE_RATE_LIMITS); }).not.toThrow();
                expect(fs.readdirSync(lockedDir)).toEqual([]);
            } finally {
                fs.chmodSync(lockedDir, 0o755);
            }
        });

        it('records the cached account hash and registers an account switch as a change', () => {
            const cacheFile = path.join(TEST_ROOT, 'usage.json');
            fs.writeFileSync(cacheFile, JSON.stringify({ sessionUsage: 2, tokenHash: 'a3f9c1d2e5b70614' }));
            __testing.setUsageCacheFileForTesting(cacheFile);
            initUsageLog(makeConfig());

            logStdinRateLimits(SAMPLE_RATE_LIMITS);
            fs.writeFileSync(cacheFile, JSON.stringify({ sessionUsage: 2, tokenHash: 'ffffffffffffffff' }));
            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            const records = readLogRecords();
            expect(records).toHaveLength(2);
            expect(records[0]?.acct).toBe('a3f9c1d2e5b70614');
            expect(records[1]?.acct).toBe('ffffffffffffffff');
        });

        it('omits acct when the usage cache has no token hash', () => {
            __testing.setUsageCacheFileForTesting(path.join(TEST_ROOT, 'missing-usage.json'));
            initUsageLog(makeConfig());

            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            expect(readLogRecords()[0]).not.toHaveProperty('acct');
        });

        it('rotates an oversized log before appending, replacing any previous rotation', () => {
            initUsageLog(makeConfig({ rotateMaxMb: 1 }));
            const oversized = `${'x'.repeat(1024 * 1024 + 16)}\n`;
            fs.writeFileSync(LOG_PATH, oversized);
            fs.writeFileSync(ROTATED_PATH, 'previous rotation\n');

            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            expect(fs.readFileSync(ROTATED_PATH, 'utf8')).toBe(oversized);
            const records = readLogRecords();
            expect(records).toHaveLength(1);
            expect(records[0]?.src).toBe('stdin');
        });

        it('leaves no temp files behind after writing state', () => {
            initUsageLog(makeConfig());

            logStdinRateLimits(SAMPLE_RATE_LIMITS);

            expect(fs.readdirSync(TEST_ROOT).filter(name => name.includes('.tmp'))).toEqual([]);
        });
    });

    describe('logApiUsagePayload', () => {
        const API_BODY = JSON.stringify({
            five_hour: { utilization: 12, resets_at: '2026-08-06T12:00:00Z' },
            tangelo: { utilization: 1 },
            limits: [{ kind: 'weekly_scoped', percent: 3 }]
        });

        it('appends the verbatim parsed body including unknown buckets', () => {
            initUsageLog(makeConfig(), { sessionId: 'sess', modelId: 'model' });

            logApiUsagePayload(API_BODY, 'a3f9c1d2e5b70614');

            const records = readLogRecords();
            expect(records).toHaveLength(1);
            expect(records[0]?.src).toBe('api');
            expect(records[0]?.acct).toBe('a3f9c1d2e5b70614');
            expect(records[0]?.raw).toEqual(JSON.parse(API_BODY));
            expect(records[0]).not.toHaveProperty('obs');
        });

        it('dedups identical payloads per source', () => {
            initUsageLog(makeConfig());

            logApiUsagePayload(API_BODY, 'a3f9c1d2e5b70614');
            logApiUsagePayload(API_BODY, 'a3f9c1d2e5b70614');

            expect(readLogRecords()).toHaveLength(1);
        });

        it('tracks stdin and api signatures independently', () => {
            initUsageLog(makeConfig());
            const shared = { five_hour: { used_percentage: 2 } };

            logStdinRateLimits(shared);
            logApiUsagePayload(JSON.stringify(shared), null);

            const records = readLogRecords();
            expect(records).toHaveLength(2);
            expect(records.map(record => record.src)).toEqual(['stdin', 'api']);
        });

        it('omits acct for a null token hash', () => {
            initUsageLog(makeConfig());

            logApiUsagePayload(API_BODY, null);

            expect(readLogRecords()[0]).not.toHaveProperty('acct');
        });

        it('does nothing when logApiUsage is disabled or the logger is uninitialized', () => {
            logApiUsagePayload(API_BODY, null);

            initUsageLog(makeConfig({ logApiUsage: false }));
            logApiUsagePayload(API_BODY, null);

            expect(fs.existsSync(LOG_PATH)).toBe(false);
        });

        it('swallows an unparseable body', () => {
            initUsageLog(makeConfig());

            expect(() => { logApiUsagePayload('not json', null); }).not.toThrow();
            expect(fs.existsSync(LOG_PATH)).toBe(false);
        });

        it('suppresses the next heartbeat after an api record', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_785_953_600_000);
            initUsageLog(makeConfig());

            logApiUsagePayload(API_BODY, null);

            nowSpy.mockReturnValue(1_785_953_600_000 + 60_000);
            logStdinRateLimits(undefined);

            expect(readLogRecords()).toHaveLength(1);
        });
    });

    describe('decision helpers', () => {
        it('shouldHeartbeat treats a missing lastHbAt as stale', () => {
            expect(__testing.shouldHeartbeat(undefined, 1000, 10)).toBe(true);
        });

        it('shouldHeartbeat compares against heartbeatMinutes', () => {
            const now = 20 * 60_000;

            expect(__testing.shouldHeartbeat(now - 10 * 60_000, now, 10)).toBe(true);
            expect(__testing.shouldHeartbeat(now - 10 * 60_000 + 1, now, 10)).toBe(false);
        });

        it('shouldRotate compares against rotateMaxMb', () => {
            expect(__testing.shouldRotate(5 * 1024 * 1024, 5)).toBe(false);
            expect(__testing.shouldRotate(5 * 1024 * 1024 + 1, 5)).toBe(true);
        });
    });
});
