import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getBlockCachePath,
    readBlockCache,
    writeBlockCache
} from '../jsonl';

function getExpectedCachePath(homeDir: string, configDir: string): string {
    const normalizedConfigDir = path.resolve(configDir);
    const configHash = createHash('sha256')
        .update(normalizedConfigDir)
        .digest('hex')
        .slice(0, 16);

    return path.join(homeDir, '.cache', 'ccstatusline', `block-cache-${configHash}.json`);
}

describe('Block Cache Functions', () => {
    let tempDir: string;
    let originalClaudeConfigDir: string | undefined;

    beforeEach(() => {
        // Create a temp directory for test isolation
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-test-'));
        // Mock os.homedir to use temp directory
        vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
        originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = path.join(tempDir, '.claude-default');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
        }
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('getBlockCachePath', () => {
        it('should return the correct cache path', () => {
            const cachePath = getBlockCachePath();
            expect(cachePath).toBe(getExpectedCachePath(tempDir, path.join(tempDir, '.claude-default')));
        });

        it('should return different cache paths for different config directories', () => {
            const profileA = path.join(tempDir, '.claude-profile-a');
            const profileB = path.join(tempDir, '.claude-profile-b');

            const pathA = getBlockCachePath(profileA);
            const pathB = getBlockCachePath(profileB);

            expect(pathA).toBe(getExpectedCachePath(tempDir, profileA));
            expect(pathB).toBe(getExpectedCachePath(tempDir, profileB));
            expect(pathA).not.toBe(pathB);
        });
    });

    describe('readBlockCache', () => {
        it('should return null when cache file does not exist', () => {
            const result = readBlockCache();
            expect(result).toBeNull();
        });

        it('should return cached date when cache file is valid', () => {
            const testDate = new Date('2025-01-26T14:00:00.000Z');
            const cachePath = getBlockCachePath();
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cachePath, JSON.stringify({ startTime: testDate.toISOString() }));

            const result = readBlockCache();
            expect(result).toEqual(testDate);
        });

        it('should return cached date when configDir matches expected value', () => {
            const testDate = new Date('2025-01-26T14:00:00.000Z');
            const configDir = path.join(tempDir, '.claude-profile-a');
            const cachePath = getBlockCachePath(configDir);
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(
                cachePath,
                JSON.stringify({ startTime: testDate.toISOString(), configDir })
            );

            const result = readBlockCache(configDir);
            expect(result).toEqual(testDate);
        });

        it('should return null when cache configDir does not match expected value', () => {
            const testDate = new Date('2025-01-26T14:00:00.000Z');
            const expectedConfigDir = path.join(tempDir, '.claude-profile-b');
            const cachePath = getBlockCachePath(expectedConfigDir);
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(
                cachePath,
                JSON.stringify({
                    startTime: testDate.toISOString(),
                    configDir: path.join(tempDir, '.claude-profile-a')
                })
            );

            const result = readBlockCache(expectedConfigDir);
            expect(result).toBeNull();
        });

        it('should return null when expected configDir is provided but cache has legacy schema', () => {
            const testDate = new Date('2025-01-26T14:00:00.000Z');
            const expectedConfigDir = path.join(tempDir, '.claude-profile-a');
            const cachePath = getBlockCachePath(expectedConfigDir);
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cachePath, JSON.stringify({ startTime: testDate.toISOString() }));

            const result = readBlockCache(expectedConfigDir);
            expect(result).toBeNull();
        });

        it('should return null when cache file has invalid JSON', () => {
            const cachePath = getBlockCachePath();
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cachePath, 'not valid json');

            const result = readBlockCache();
            expect(result).toBeNull();
        });

        it('should return null when cache file has missing startTime', () => {
            const cachePath = getBlockCachePath();
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cachePath, JSON.stringify({}));

            const result = readBlockCache();
            expect(result).toBeNull();
        });

        it('should return null when startTime is not a string', () => {
            const cachePath = getBlockCachePath();
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cachePath, JSON.stringify({ startTime: 12345 }));

            const result = readBlockCache();
            expect(result).toBeNull();
        });

        it('should return null when startTime is invalid date string', () => {
            const cachePath = getBlockCachePath();
            const cacheDir = path.dirname(cachePath);
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cachePath, JSON.stringify({ startTime: 'not a date' }));

            const result = readBlockCache();
            expect(result).toBeNull();
        });
    });

    describe('writeBlockCache', () => {
        it('should create directory and write cache file', () => {
            const testDate = new Date('2025-01-26T14:00:00.000Z');
            const configDir = path.join(tempDir, '.claude-profile-a');

            writeBlockCache(testDate, configDir);

            const cachePath = getBlockCachePath(configDir);
            expect(fs.existsSync(cachePath)).toBe(true);
            const content = fs.readFileSync(cachePath, 'utf-8');
            const parsed = JSON.parse(content) as { startTime: string; configDir: string };
            expect(parsed.startTime).toBe(testDate.toISOString());
            expect(parsed.configDir).toBe(path.resolve(configDir));
        });

        it('should overwrite existing cache file', () => {
            const firstDate = new Date('2025-01-26T14:00:00.000Z');
            const secondDate = new Date('2025-01-26T16:00:00.000Z');
            const configDir = path.join(tempDir, '.claude-profile-a');

            writeBlockCache(firstDate, configDir);
            writeBlockCache(secondDate, configDir);

            const cachePath = getBlockCachePath(configDir);
            const content = fs.readFileSync(cachePath, 'utf-8');
            const parsed = JSON.parse(content) as { startTime: string; configDir: string };
            expect(parsed.startTime).toBe(secondDate.toISOString());
            expect(parsed.configDir).toBe(path.resolve(configDir));
        });
    });
});

describe('getCachedBlockMetrics integration', () => {
    let tempDir: string;
    let originalClaudeConfigDir: string | undefined;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-test-'));
        vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
        // Mock CLAUDE_CONFIG_DIR to point to a non-existent directory
        // This ensures getBlockMetrics returns null when cache is expired
        originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = path.join(tempDir, '.claude-nonexistent');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        // Restore original CLAUDE_CONFIG_DIR
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return cached result when cache is within block duration', async () => {
        const { getCachedBlockMetrics, writeBlockCache, getBlockCachePath } = await import('../jsonl');

        // Set up a cache with a start time 2 hours ago (within 5-hour block)
        const testStartTime = new Date();
        testStartTime.setHours(testStartTime.getHours() - 2);

        writeBlockCache(testStartTime);

        // Verify cache was written
        expect(fs.existsSync(getBlockCachePath())).toBe(true);

        const result = getCachedBlockMetrics();

        expect(result).not.toBeNull();
        expect(result?.startTime.getTime()).toBe(testStartTime.getTime());
    });

    it('should recalculate when cache is expired (beyond block duration)', async () => {
        const { getCachedBlockMetrics, writeBlockCache } = await import('../jsonl');

        // Set up a cache with a start time 6 hours ago (beyond 5-hour block)
        const expiredStartTime = new Date();
        expiredStartTime.setHours(expiredStartTime.getHours() - 6);

        writeBlockCache(expiredStartTime);

        const result = getCachedBlockMetrics();

        // Should return null because cache is expired and no real JSONL files exist
        expect(result).toBeNull();
    });

    it('should recalculate when the cached block starts in the future', async () => {
        const { getCachedBlockMetrics, writeBlockCache } = await import('../jsonl');

        // Written while the system clock ran ahead, before it was set back
        const futureStartTime = new Date();
        futureStartTime.setHours(futureStartTime.getHours() + 2);

        writeBlockCache(futureStartTime);

        const result = getCachedBlockMetrics();

        // Should return null because the block hasn't started and no real JSONL files exist
        expect(result).toBeNull();
    });

    it('should recalculate when no cache exists', async () => {
        const { getCachedBlockMetrics } = await import('../jsonl');

        const result = getCachedBlockMetrics();

        // Should return null because no cache and no real JSONL files exist
        expect(result).toBeNull();
    });

    it('should recalculate when cache belongs to a different config directory', async () => {
        const { getCachedBlockMetrics, writeBlockCache } = await import('../jsonl');
        const profileA = path.join(tempDir, '.claude-profile-a');
        const profileB = path.join(tempDir, '.claude-profile-b');

        const testStartTime = new Date();
        testStartTime.setHours(testStartTime.getHours() - 2);

        process.env.CLAUDE_CONFIG_DIR = profileA;
        writeBlockCache(testStartTime);

        process.env.CLAUDE_CONFIG_DIR = profileB;
        const result = getCachedBlockMetrics();

        // Should return null because cache is fresh but scoped to a different profile
        expect(result).toBeNull();
    });
});

describe('getCachedBlockMetrics negative caching', () => {
    let tempDir: string;
    let originalClaudeConfigDir: string | undefined;

    function readRawCache(): { startTime?: string; emptyUntil?: string; configDir?: string } {
        return JSON.parse(fs.readFileSync(getBlockCachePath(), 'utf-8')) as { startTime?: string; emptyUntil?: string; configDir?: string };
    }

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-empty-'));
        vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
        originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        // A config directory with no transcripts, so a scan finds no block.
        process.env.CLAUDE_CONFIG_DIR = path.join(tempDir, '.claude-nonexistent');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('records that a scan found no block', async () => {
        const { getCachedBlockMetrics } = await import('../jsonl');

        expect(getCachedBlockMetrics()).toBeNull();

        const cached = readRawCache();
        expect(typeof cached.emptyUntil).toBe('string');
        expect(cached.configDir).toBe(path.resolve(process.env.CLAUDE_CONFIG_DIR ?? ''));

        // The record bounds how late a new block can be reported, so it has to
        // stand long enough to be worth having and short enough to go unnoticed.
        const standsForMs = new Date(cached.emptyUntil ?? '').getTime() - Date.now();
        expect(standsForMs).toBeGreaterThan(0);
        expect(standsForMs).toBeLessThanOrEqual(5 * 60 * 1000);
    });

    it('does not scan again while the record stands', async () => {
        const { getCachedBlockMetrics } = await import('../jsonl');

        expect(getCachedBlockMetrics()).toBeNull();
        const first = readRawCache().emptyUntil;

        expect(getCachedBlockMetrics()).toBeNull();

        // A second scan would have written a later instant.
        expect(readRawCache().emptyUntil).toBe(first);
    });

    it('scans again once the record lapses', async () => {
        const { getCachedBlockMetrics } = await import('../jsonl');
        const cachePath = getBlockCachePath();
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const lapsed = new Date(Date.now() - 1000).toISOString();
        fs.writeFileSync(cachePath, JSON.stringify({
            emptyUntil: lapsed,
            configDir: path.resolve(process.env.CLAUDE_CONFIG_DIR ?? '')
        }));

        expect(getCachedBlockMetrics()).toBeNull();

        expect(readRawCache().emptyUntil).not.toBe(lapsed);
    });

    it('scans again when a record reaches further out than one interval', async () => {
        const { getCachedBlockMetrics } = await import('../jsonl');
        const cachePath = getBlockCachePath();
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        // Written while the system clock ran ahead, before it was set back
        const farAhead = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        fs.writeFileSync(cachePath, JSON.stringify({
            emptyUntil: farAhead,
            configDir: path.resolve(process.env.CLAUDE_CONFIG_DIR ?? '')
        }));

        expect(getCachedBlockMetrics()).toBeNull();

        expect(readRawCache().emptyUntil).not.toBe(farAhead);
    });

    it('ignores a record belonging to another config directory', async () => {
        const { getCachedBlockMetrics } = await import('../jsonl');
        const otherProfile = path.join(tempDir, '.claude-other');
        const cachePath = getBlockCachePath();
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const foreign = new Date(Date.now() + 60_000).toISOString();
        fs.writeFileSync(cachePath, JSON.stringify({ emptyUntil: foreign, configDir: path.resolve(otherProfile) }));

        expect(getCachedBlockMetrics()).toBeNull();

        // The foreign record was not trusted, so a scan ran and replaced it.
        expect(readRawCache().configDir).toBe(path.resolve(process.env.CLAUDE_CONFIG_DIR ?? ''));
    });

    it('prefers a live block over a stale no-block record', async () => {
        const { getCachedBlockMetrics, writeBlockCache } = await import('../jsonl');
        const startTime = new Date();
        startTime.setHours(startTime.getHours() - 2);
        writeBlockCache(startTime);

        const result = getCachedBlockMetrics();

        expect(result?.startTime.getTime()).toBe(startTime.getTime());
    });
});

describe('getCachedBlockMetrics carrying an expired block forward', () => {
    const HOUR_MS = 60 * 60 * 1000;
    let tempDir: string;
    let originalClaudeConfigDir: string | undefined;

    function floorToHourUtc(timestamp: number): number {
        const floored = new Date(timestamp);
        floored.setUTCMinutes(0, 0, 0);
        return floored.getTime();
    }

    // One served request every 20 minutes, counting back from toMs to fromMs,
    // so the newest row is at toMs whatever minute of the hour the test runs in
    function writeActivity(fromMs: number, toMs: number): void {
        const projectDir = path.join(process.env.CLAUDE_CONFIG_DIR ?? '', 'projects', 'project-a');
        fs.mkdirSync(projectDir, { recursive: true });
        const rows: string[] = [];
        for (let t = toMs; t >= fromMs; t -= 20 * 60 * 1000) {
            rows.unshift(JSON.stringify({
                timestamp: new Date(t).toISOString(),
                message: { usage: { input_tokens: 100, output_tokens: 50 } }
            }));
        }
        fs.writeFileSync(path.join(projectDir, 'session.jsonl'), rows.join('\n'));
    }

    function readRawCache(): { startTime?: string; emptyUntil?: string } {
        return JSON.parse(fs.readFileSync(getBlockCachePath(), 'utf-8')) as { startTime?: string; emptyUntil?: string };
    }

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-chain-'));
        vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
        originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = path.join(tempDir, '.claude');
        fs.mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('starts the next block where the cached one ended, keeping the chain the scan placed', async () => {
        const { getBlockMetrics, getCachedBlockMetrics, writeBlockCache } = await import('../jsonl');
        const now = Date.now();
        const currentHour = floorToHourUtc(now);
        // Continuous work for 30 hours: a fresh scan chains blocks from where
        // it began
        writeActivity(now - (30 * HOUR_MS), now);
        const scanned = getBlockMetrics()?.startTime.getTime();

        // A block cached on a different footing, which ended 1 or 2 hours ago.
        // The next one starts as it ended and runs past now
        const cachedStart = [6, 7]
            .map(hours => currentHour - (hours * HOUR_MS))
            .find(start => start + (5 * HOUR_MS) !== scanned) ?? 0;
        writeBlockCache(new Date(cachedStart));

        const result = getCachedBlockMetrics();

        expect(result?.startTime.getTime()).toBe(cachedStart + (5 * HOUR_MS));
        expect(result?.startTime.getTime()).not.toBe(scanned);
        expect(readRawCache().startTime).toBe(new Date(cachedStart + (5 * HOUR_MS)).toISOString());
    });

    it('reports no block when nothing has run since the cached block ended, and keeps it to carry forward', async () => {
        const { getCachedBlockMetrics, writeBlockCache } = await import('../jsonl');
        const cachedStart = floorToHourUtc(Date.now()) - (7 * HOUR_MS);
        writeActivity(cachedStart + (10 * 60 * 1000), cachedStart + (4 * HOUR_MS));
        writeBlockCache(new Date(cachedStart));

        expect(getCachedBlockMetrics()).toBeNull();

        const cached = readRawCache();
        expect(typeof cached.emptyUntil).toBe('string');
        expect(cached.startTime).toBe(new Date(cachedStart).toISOString());
    });

    it('falls back to a full scan when the cached block ended too long ago to carry forward', async () => {
        const { getBlockMetrics, getCachedBlockMetrics, writeBlockCache } = await import('../jsonl');
        const now = Date.now();
        writeActivity(now - (30 * HOUR_MS), now);
        writeBlockCache(new Date(floorToHourUtc(now) - (60 * HOUR_MS)));

        const result = getCachedBlockMetrics();

        expect(result).not.toBeNull();
        expect(result?.startTime.getTime()).toBe(getBlockMetrics()?.startTime.getTime());
    });
});
