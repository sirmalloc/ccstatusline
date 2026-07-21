import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CACHE_SCHEMA_VERSION = 1 as const;
const PRUNE_AFTER_MS = 60 * 60 * 1000;
// A lock older than this is assumed to belong to a writer that crashed
// mid-write rather than one that is merely slow; stealing it lets the cache
// recover instead of wedging permanently.
const LOCK_STALE_MS = 2000;

interface WidthCacheEntry {
    width: number | null;
    createdAt: number;
}

interface PersistentWidthCache {
    version: typeof CACHE_SCHEMA_VERSION;
    entries: Record<string, WidthCacheEntry>;
}

export interface WidthCacheDeps {
    readFileSync: (path: string) => string;
    writeFileSync: (path: string, data: string) => void;
    renameSync: (from: string, to: string) => void;
    mkdirSync: (path: string) => void;
    now: () => number;
    cachePath: string;
}

function defaultCachePath(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'terminal-width.json');
}

const defaultDeps: WidthCacheDeps = {
    readFileSync: (p: string) => fs.readFileSync(p, 'utf-8'),
    writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, 'utf-8'); },
    renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
    mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
    now: () => Date.now(),
    cachePath: defaultCachePath()
};

function isEntry(value: unknown): value is WidthCacheEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    return (typeof entry.width === 'number' || entry.width === null)
        && typeof entry.createdAt === 'number';
}

function isEexist(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EEXIST';
}

/**
 * Best-effort mutual exclusion for the read-modify-write in writeCachedWidth.
 * Without this, two ccstatusline processes (e.g. two concurrent Claude Code
 * sessions) racing to write the same cache file can each read a snapshot
 * that doesn't include the other's entry yet, and whichever renames last
 * silently clobbers the other's write.
 *
 * Uses O_CREAT|O_EXCL on a `.lock` file as the exclusion primitive (atomic on
 * POSIX filesystems). Non-blocking: if the lock is held and fresh, the caller
 * skips this write entirely rather than spinning -- the cache is best-effort,
 * so losing one write is fine, but corrupting/clobbering another writer's
 * entry is not. A lock older than LOCK_STALE_MS is assumed abandoned by a
 * crashed writer and is stolen so the cache can't wedge permanently.
 */
function withCacheLock(cachePath: string, fn: () => void): void {
    const lockPath = `${cachePath}.lock`;
    let haveLock = false;
    // Only EEXIST means "another writer genuinely holds the lock" -- anything
    // else (EMFILE under fd pressure, a missing directory, etc.) is unrelated
    // to contention, so the write proceeds unlocked rather than being dropped:
    // this locking is additive protection, and must never make the cache less
    // reliable than it was before locking existed.
    let contended = false;

    try {
        try {
            fs.closeSync(fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY));
            haveLock = true;
        } catch (error) {
            if (isEexist(error)) {
                contended = true;
                try {
                    if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
                        fs.unlinkSync(lockPath);
                        fs.closeSync(fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY));
                        haveLock = true;
                        contended = false;
                    }
                } catch {
                    // Still contended, or another writer already recovered it; skip this write.
                }
            }
        }

        if (haveLock || !contended) {
            fn();
        }
    } finally {
        if (haveLock) {
            try {
                fs.unlinkSync(lockPath);
            } catch {
                // best-effort
            }
        }
    }
}

function readCache(deps: WidthCacheDeps): PersistentWidthCache {
    const empty: PersistentWidthCache = { version: CACHE_SCHEMA_VERSION, entries: {} };
    try {
        const parsed = JSON.parse(deps.readFileSync(deps.cachePath)) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return empty;
        }

        const data = parsed as { version?: unknown; entries?: unknown };
        if (data.version !== CACHE_SCHEMA_VERSION || typeof data.entries !== 'object' || data.entries === null) {
            return empty;
        }

        const entries: Record<string, WidthCacheEntry> = {};
        for (const [key, value] of Object.entries(data.entries)) {
            if (isEntry(value)) {
                entries[key] = value;
            }
        }

        return { version: CACHE_SCHEMA_VERSION, entries };
    } catch {
        // Missing or corrupt cache is a miss, never a failure.
        return empty;
    }
}

/**
 * Read a cached width for this session.
 *
 * Returns null on miss/expiry/corruption, or a wrapper on hit. The wrapper
 * matters: a cached width of `null` means "we probed and there is no TTY",
 * which is a legitimate hit. Collapsing that to a bare null would make the
 * no-TTY case -- the expensive one -- re-probe on every render.
 *
 * ttlSeconds of 0 disables the cache (always a miss). NOTE: this differs from
 * gitCacheTtlSeconds, where 0 means "never expire". Divergence is intentional.
 */
export function readCachedWidth(
    sessionId: string,
    ttlSeconds: number,
    deps: WidthCacheDeps = defaultDeps
): { width: number | null } | null {
    if (ttlSeconds <= 0) {
        return null;
    }

    const entry = readCache(deps).entries[sessionId];
    if (!entry) {
        return null;
    }

    if (deps.now() - entry.createdAt > ttlSeconds * 1000) {
        return null;
    }

    return { width: entry.width };
}

/** Persist a probed width (including a null "no TTY" result). Best-effort; never throws. */
export function writeCachedWidth(
    sessionId: string,
    width: number | null,
    deps: WidthCacheDeps = defaultDeps
): void {
    try {
        // Ensure the directory exists before locking: the lock file lives
        // next to the cache file, so on the very first write ever, the lock
        // acquisition itself would fail with ENOENT otherwise.
        deps.mkdirSync(path.dirname(deps.cachePath));

        withCacheLock(deps.cachePath, () => {
            const now = deps.now();
            const existing = readCache(deps);

            // Prune entries older than an hour so the file cannot grow without
            // bound across many sessions.
            const entries: Record<string, WidthCacheEntry> = {};
            for (const [key, entry] of Object.entries(existing.entries)) {
                if (now - entry.createdAt <= PRUNE_AFTER_MS) {
                    entries[key] = entry;
                }
            }

            entries[sessionId] = { width, createdAt: now };
            const cache: PersistentWidthCache = { version: CACHE_SCHEMA_VERSION, entries };

            const tempPath = `${deps.cachePath}.${process.pid}.tmp`;
            deps.writeFileSync(tempPath, JSON.stringify(cache));
            deps.renameSync(tempPath, deps.cachePath);
        });
    } catch {
        // Best-effort cache; the statusline must render regardless.
    }
}
