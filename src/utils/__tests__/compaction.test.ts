import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    detectCompaction,
    loadCompactionState,
    saveCompactionState,
    type CompactionState
} from '../compaction';

const fresh: CompactionState = { count: 0, prevCtxPct: -1 };

describe('detectCompaction', () => {
    it('does not detect on first render (sentinel prevCtxPct)', () => {
        const result = detectCompaction(40, fresh);
        expect(result.count).toBe(0);
        expect(result.prevCtxPct).toBe(40);
    });

    it('detects compaction when ctx drops by more than 2 points', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(30, prev);
        expect(result.count).toBe(1);
    });

    it('does not detect when ctx drops by exactly 2 points', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(38, prev);
        expect(result.count).toBe(0);
    });

    it('does not detect when ctx drops by 1 point (rounding noise)', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 8 };
        const result = detectCompaction(7, prev);
        expect(result.count).toBe(0);
    });

    it('does not detect when ctx increases', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(45, prev);
        expect(result.count).toBe(0);
    });

    it('does not detect when ctx stays the same', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(40, prev);
        expect(result.count).toBe(0);
    });

    it('detects 3-point drop on 1M window', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 8 };
        const result = detectCompaction(5, prev);
        expect(result.count).toBe(1);
    });

    it('detects large compaction on 200K window', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 85 };
        const result = detectCompaction(30, prev);
        expect(result.count).toBe(1);
    });

    it('increments existing count', () => {
        const prev: CompactionState = { count: 3, prevCtxPct: 70 };
        const result = detectCompaction(40, prev);
        expect(result.count).toBe(4);
    });

    it('updates prevCtxPct regardless of detection', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        const result = detectCompaction(45, prev);
        expect(result.prevCtxPct).toBe(45);
    });

    it('accepts custom threshold', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 10 };
        const result = detectCompaction(8, prev, 1);
        expect(result.count).toBe(1);
    });

    it('returns state unchanged for NaN input (no poison)', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        expect(detectCompaction(NaN, prev)).toEqual(prev);
    });

    it('returns state unchanged for Infinity input', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        expect(detectCompaction(Infinity, prev)).toEqual(prev);
    });

    it('returns state unchanged for negative input', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40 };
        expect(detectCompaction(-1, prev)).toEqual(prev);
    });

    it('detects drops using non-integer percentages', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 40.4 };
        // 2.8-point drop, exceeds default threshold of 2
        const result = detectCompaction(37.6, prev);
        expect(result.count).toBe(1);
    });

    it('handles a session that starts at 0% (sentinel guards first render)', () => {
        // sequence: -1 (fresh) -> 0 -> 5 -> 30 -> 10
        // First three transitions: no detection. Fourth (30 -> 10) is a real drop.
        let state = fresh;
        state = detectCompaction(0, state);
        expect(state).toEqual({ count: 0, prevCtxPct: 0 });
        state = detectCompaction(5, state);
        expect(state.count).toBe(0);
        state = detectCompaction(30, state);
        expect(state.count).toBe(0);
        state = detectCompaction(10, state);
        expect(state.count).toBe(1);
    });

    it('detects multiple sequential compactions', () => {
        // sequence: -1 (fresh) -> 40 -> 10 -> 50 -> 20
        let state = fresh;
        state = detectCompaction(40, state);
        state = detectCompaction(10, state);
        expect(state.count).toBe(1);
        state = detectCompaction(50, state);
        state = detectCompaction(20, state);
        expect(state.count).toBe(2);
    });

    it('with threshold 0, every strict drop counts', () => {
        const prev: CompactionState = { count: 0, prevCtxPct: 10 };
        expect(detectCompaction(9.5, prev, 0).count).toBe(1);
    });
});

describe('persistence', () => {
    let testHome: string;

    beforeEach(() => {
        testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'compaction-test-'));
        vi.spyOn(os, 'homedir').mockReturnValue(testHome);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(testHome, { recursive: true, force: true });
    });

    it('round-trips state through save and load', () => {
        const state: CompactionState = { count: 5, prevCtxPct: 42 };
        saveCompactionState('test-session', state);
        const loaded = loadCompactionState('test-session');
        expect(loaded).toEqual(state);
    });

    it('returns fresh state for unknown session', () => {
        const loaded = loadCompactionState('nonexistent');
        expect(loaded).toEqual({ count: 0, prevCtxPct: -1 });
    });

    it('sanitizes path traversal in session ID', () => {
        const malicious = '../../../../../../tmp/pwn';
        saveCompactionState(malicious, { count: 1, prevCtxPct: 50 });

        const cacheDir = path.join(testHome, '.cache', 'ccstatusline', 'compaction');
        const files = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];
        expect(files.length).toBe(1);
        expect(files[0]).toMatch(/^compaction-[a-zA-Z0-9_-]+\.json$/);

        expect(fs.existsSync('/tmp/pwn.json')).toBe(false);
    });

    it('hashes session IDs that contain only illegal characters to avoid collision', () => {
        // Without hashing, both '....' and '!!!!' would sanitize to '____' and collide.
        saveCompactionState('....', { count: 1, prevCtxPct: 10 });
        saveCompactionState('!!!!', { count: 2, prevCtxPct: 20 });
        expect(loadCompactionState('....').count).toBe(1);
        expect(loadCompactionState('!!!!').count).toBe(2);
    });

    it('hashes empty session ID to avoid blank filename leaf', () => {
        saveCompactionState('', { count: 1, prevCtxPct: 10 });
        const cacheDir = path.join(testHome, '.cache', 'ccstatusline', 'compaction');
        const files = fs.readdirSync(cacheDir);
        expect(files.length).toBe(1);
        expect(files[0]).not.toBe('compaction-.json');
        expect(files[0]).toMatch(/^compaction-[a-f0-9]{32}\.json$/);
    });

    it('does not throw on write failure', () => {
        vi.spyOn(os, 'homedir').mockReturnValue('/nonexistent/readonly/path');
        expect(() => {
            saveCompactionState('test', { count: 1, prevCtxPct: 50 });
        }).not.toThrow();
    });

    it('returns fresh state when cache file has corrupted JSON', () => {
        saveCompactionState('corrupt-test', { count: 5, prevCtxPct: 50 });
        const cacheDir = path.join(testHome, '.cache', 'ccstatusline', 'compaction');
        const cacheFile = path.join(cacheDir, fs.readdirSync(cacheDir)[0] ?? '');
        fs.writeFileSync(cacheFile, '{ this is not valid json');

        const loaded = loadCompactionState('corrupt-test');
        expect(loaded).toEqual({ count: 0, prevCtxPct: -1 });
    });

    it('returns fresh state when cache file exceeds size cap', () => {
        saveCompactionState('big-test', { count: 5, prevCtxPct: 50 });
        const cacheDir = path.join(testHome, '.cache', 'ccstatusline', 'compaction');
        const cacheFile = path.join(cacheDir, fs.readdirSync(cacheDir)[0] ?? '');
        fs.writeFileSync(cacheFile, 'a'.repeat(8192));

        const loaded = loadCompactionState('big-test');
        expect(loaded).toEqual({ count: 0, prevCtxPct: -1 });
    });

    it.skipIf(process.platform === 'win32')('returns fresh state when cache path is a symlink', () => {
        const cacheDir = path.join(testHome, '.cache', 'ccstatusline', 'compaction');
        fs.mkdirSync(cacheDir, { recursive: true });
        const realPath = path.join(testHome, 'real.json');
        fs.writeFileSync(realPath, JSON.stringify({ count: 99, prevCtxPct: 50 }));

        // sessionId 'symlink-test' has only legal chars, so the cache filename
        // is deterministically compaction-symlink-test.json
        const sessionId = 'symlink-test';
        const symlinkPath = path.join(cacheDir, `compaction-${sessionId}.json`);
        fs.symlinkSync(realPath, symlinkPath);

        const loaded = loadCompactionState(sessionId);
        expect(loaded).toEqual({ count: 0, prevCtxPct: -1 });
    });

    it('uses zod defaults for missing fields in cache file', () => {
        const cacheDir = path.join(testHome, '.cache', 'ccstatusline', 'compaction');
        fs.mkdirSync(cacheDir, { recursive: true });
        const cacheFile = path.join(cacheDir, 'compaction-partial.json');
        fs.writeFileSync(cacheFile, JSON.stringify({}));

        const loaded = loadCompactionState('partial');
        expect(loaded).toEqual({ count: 0, prevCtxPct: -1 });
    });

    it.skipIf(process.platform === 'win32')('atomic save replaces a planted symlink rather than writing through it', () => {
        const cacheDir = path.join(testHome, '.cache', 'ccstatusline', 'compaction');
        fs.mkdirSync(cacheDir, { recursive: true });
        const sessionId = 'rename-test';
        const targetPath = path.join(cacheDir, `compaction-${sessionId}.json`);
        const decoyTarget = path.join(testHome, 'decoy.txt');
        fs.writeFileSync(decoyTarget, 'do not overwrite me');
        fs.symlinkSync(decoyTarget, targetPath);

        saveCompactionState(sessionId, { count: 1, prevCtxPct: 30 });

        // The decoy must be untouched; the cache path is now a regular file.
        expect(fs.readFileSync(decoyTarget, 'utf-8')).toBe('do not overwrite me');
        expect(fs.lstatSync(targetPath).isFile()).toBe(true);
    });
});
