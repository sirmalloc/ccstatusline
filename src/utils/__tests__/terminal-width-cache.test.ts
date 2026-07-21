import * as fs from 'fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { WidthCacheDeps } from '../terminal-width-cache';
import {
    readCachedWidth,
    writeCachedWidth
} from '../terminal-width-cache';

// Unique per test process/run: the lock file lives on the real filesystem
// (see terminal-width-cache.ts's withCacheLock), so a fixed shared path here
// could collide with another concurrently-running test worker/process on the
// same machine touching the same real path.
const CACHE_PATH = `/tmp/test-terminal-width-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
const LOCK_PATH = `${CACHE_PATH}.lock`;

function makeDeps(initial: string | null, now = 1_000_000): WidthCacheDeps & { files: Map<string, string> } {
    const files = new Map<string, string>();
    if (initial !== null) {
        files.set(CACHE_PATH, initial);
    }

    return {
        files,
        cachePath: CACHE_PATH,
        now: () => now,
        mkdirSync: () => undefined,
        readFileSync: (p: string) => {
            const content = files.get(p);
            if (content === undefined) {
                throw new Error('ENOENT');
            }

            return content;
        },
        writeFileSync: (p: string, data: string) => { files.set(p, data); },
        renameSync: (from: string, to: string) => {
            const data = files.get(from);
            if (data === undefined) {
                throw new Error('ENOENT');
            }

            files.set(to, data);
            files.delete(from);
        }
    };
}

describe('terminal width cache', () => {
    let deps: ReturnType<typeof makeDeps>;

    beforeEach(() => {
        deps = makeDeps(null);
        try {
            fs.unlinkSync(LOCK_PATH);
        } catch {
            // no lock file left over from a previous test
        }
    });

    afterEach(() => {
        try {
            fs.unlinkSync(LOCK_PATH);
        } catch {
            // already cleaned up
        }
    });

    it('returns null on a cache miss', () => {
        expect(readCachedWidth('session-a', 5, deps)).toBeNull();
    });

    it('round-trips a width within the TTL', () => {
        writeCachedWidth('session-a', 209, deps);
        expect(readCachedWidth('session-a', 5, deps)).toEqual({ width: 209 });
    });

    // The whole point: a cached "no tty" must be a HIT, not a miss, or the
    // expensive no-tty case re-probes forever.
    it('round-trips a cached null width as a hit', () => {
        writeCachedWidth('session-a', null, deps);
        expect(readCachedWidth('session-a', 5, deps)).toEqual({ width: null });
    });

    it('keys entries by session so sessions do not share a width', () => {
        writeCachedWidth('session-a', 209, deps);
        writeCachedWidth('session-b', 80, deps);
        expect(readCachedWidth('session-a', 5, deps)).toEqual({ width: 209 });
        expect(readCachedWidth('session-b', 5, deps)).toEqual({ width: 80 });
    });

    it('treats an entry older than the TTL as a miss', () => {
        writeCachedWidth('session-a', 209, deps);
        const later = makeDeps(deps.files.get(CACHE_PATH) ?? null, 1_000_000 + 6_000);
        expect(readCachedWidth('session-a', 5, later)).toBeNull();
    });

    it('treats ttlSeconds of 0 as caching disabled (always a miss)', () => {
        writeCachedWidth('session-a', 209, deps);
        expect(readCachedWidth('session-a', 0, deps)).toBeNull();
    });

    it('treats a corrupt cache file as a miss and does not throw', () => {
        const corrupt = makeDeps('{ this is not json');
        expect(() => readCachedWidth('session-a', 5, corrupt)).not.toThrow();
        expect(readCachedWidth('session-a', 5, corrupt)).toBeNull();
    });

    it('never throws when the cache is unwritable', () => {
        const unwritable = makeDeps(null);
        unwritable.writeFileSync = () => { throw new Error('EACCES'); };
        expect(() => { writeCachedWidth('session-a', 209, unwritable); }).not.toThrow();
    });

    it('prunes entries older than an hour on write', () => {
        writeCachedWidth('stale-session', 100, deps);
        const muchLater = makeDeps(deps.files.get(CACHE_PATH) ?? null, 1_000_000 + 3_600_001);
        writeCachedWidth('fresh-session', 209, muchLater);

        const written = JSON.parse(muchLater.files.get(CACHE_PATH) ?? '{}') as { entries: Record<string, unknown> };
        expect(Object.keys(written.entries)).toEqual(['fresh-session']);
    });

    it('writes atomically via a temp file and rename', () => {
        const renames: string[] = [];
        const tracking = makeDeps(null);
        tracking.renameSync = (from: string, to: string) => { renames.push(`${from}->${to}`); };
        writeCachedWidth('session-a', 209, tracking);
        expect(renames).toHaveLength(1);
        expect(renames[0]).toContain(`->${CACHE_PATH}`);
    });

    describe('write locking', () => {
        it('skips the write when a fresh lock is already held (concurrent writer)', () => {
            fs.writeFileSync(LOCK_PATH, String(process.pid));

            writeCachedWidth('session-a', 209, deps);

            expect(deps.files.has(CACHE_PATH)).toBe(false);
            expect(readCachedWidth('session-a', 5, deps)).toBeNull();
        });

        it('does not clobber another writer: only its own entry is ever written under contention', () => {
            // Simulate session-b's writer already having committed while session-a's
            // writer holds the lock: session-a's deps snapshot predates that write.
            writeCachedWidth('session-b', 80, deps);
            const snapshotBeforeB = new Map(deps.files);

            const staleDeps = { ...deps, files: snapshotBeforeB };
            fs.writeFileSync(LOCK_PATH, String(process.pid));
            writeCachedWidth('session-a', 209, staleDeps);
            fs.unlinkSync(LOCK_PATH);

            // session-a's write was skipped (lock held), so session-b's already
            // committed entry survives untouched -- nothing was lost to a stale
            // read-modify-write.
            expect(readCachedWidth('session-b', 5, deps)).toEqual({ width: 80 });
        });

        it('steals a stale lock (older than the staleness threshold) and proceeds', () => {
            fs.writeFileSync(LOCK_PATH, String(process.pid));
            const past = new Date(Date.now() - 10_000);
            fs.utimesSync(LOCK_PATH, past, past);

            writeCachedWidth('session-a', 209, deps);

            expect(readCachedWidth('session-a', 5, deps)).toEqual({ width: 209 });
        });

        it('releases the lock after a successful write', () => {
            writeCachedWidth('session-a', 209, deps);
            expect(fs.existsSync(LOCK_PATH)).toBe(false);
        });

        it('releases the lock even when the write throws', () => {
            const throwing = makeDeps(null);
            throwing.writeFileSync = () => { throw new Error('disk full'); };
            writeCachedWidth('session-a', 209, throwing);
            expect(fs.existsSync(LOCK_PATH)).toBe(false);
        });
    });
});
