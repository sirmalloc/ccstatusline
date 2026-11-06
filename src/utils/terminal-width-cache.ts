import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { withCacheLock } from './cache-lock';

const CACHE_SCHEMA_VERSION = 1 as const;
const PRUNE_AFTER_MS = 60 * 60 * 1000;

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
    unlinkSync: (path: string) => void;
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
    unlinkSync: (p: string) => { fs.unlinkSync(p); },
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
 * gitCacheTtlSeconds, where 0 disables age-based expiry (output is reused
 * until .git/HEAD or .git/index changes; a failed command is retried after
 * 5 seconds). Divergence is intentional.
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

            // Stable temp name, as in git.ts writePersistentCache: a held
            // handle (e.g. a Windows virus scanner or sync client) can make the
            // rename and the cleanup unlink both fail, and with a name unique
            // to the process every render would then leave one more orphan.
            // Writers use it under the lock; one that proceeds unlocked can at
            // worst leave malformed JSON, which readCache treats as a miss.
            const tempPath = `${deps.cachePath}.tmp`;
            try {
                deps.writeFileSync(tempPath, JSON.stringify(cache));
                deps.renameSync(tempPath, deps.cachePath);
            } catch {
                try {
                    deps.unlinkSync(tempPath);
                } catch { /* best-effort cleanup; ignore */ }
            }
        });
    } catch {
        // Best-effort cache; the statusline must render regardless.
    }
}
