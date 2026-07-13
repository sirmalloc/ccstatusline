import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

        deps.mkdirSync(path.dirname(deps.cachePath));
        const tempPath = `${deps.cachePath}.${process.pid}.tmp`;
        deps.writeFileSync(tempPath, JSON.stringify(cache));
        deps.renameSync(tempPath, deps.cachePath);
    } catch {
        // Best-effort cache; the statusline must render regardless.
    }
}
