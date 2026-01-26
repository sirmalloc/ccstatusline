import * as fs from 'fs';
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

describe('Block Cache Functions', () => {
    let tempDir: string;

    beforeEach(() => {
        // Create a temp directory for test isolation
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-test-'));
        // Mock os.homedir to use temp directory
        vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        // Clean up temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('getBlockCachePath', () => {
        it('should return the correct cache path', () => {
            const cachePath = getBlockCachePath();
            expect(cachePath).toBe(path.join(tempDir, '.cache', 'ccstatusline', 'block-cache.json'));
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

            writeBlockCache(testDate);

            const cachePath = getBlockCachePath();
            expect(fs.existsSync(cachePath)).toBe(true);
            const content = fs.readFileSync(cachePath, 'utf-8');
            const parsed = JSON.parse(content) as { startTime: string };
            expect(parsed.startTime).toBe(testDate.toISOString());
        });

        it('should overwrite existing cache file', () => {
            const firstDate = new Date('2025-01-26T14:00:00.000Z');
            const secondDate = new Date('2025-01-26T16:00:00.000Z');

            writeBlockCache(firstDate);
            writeBlockCache(secondDate);

            const cachePath = getBlockCachePath();
            const content = fs.readFileSync(cachePath, 'utf-8');
            const parsed = JSON.parse(content) as { startTime: string };
            expect(parsed.startTime).toBe(secondDate.toISOString());
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

    it('should recalculate when no cache exists', async () => {
        const { getCachedBlockMetrics } = await import('../jsonl');

        const result = getCachedBlockMetrics();

        // Should return null because no cache and no real JSONL files exist
        expect(result).toBeNull();
    });
});