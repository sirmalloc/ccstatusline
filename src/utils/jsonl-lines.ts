import * as fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readFileSync = fs.readFileSync;
const stat = promisify(fs.stat);
const statSync = fs.statSync;

/** Transcripts to retain. A render reads the session transcript and the subagent transcripts it references. */
const MAX_CACHED_FILES = 8;

interface CacheEntry {
    /** Size and modification time, so an appended transcript is re-read rather than served stale. */
    readonly version: string;
    readonly lines: readonly string[];
}

/**
 * Split lines, keyed by file identity.
 *
 * @remarks
 * A render reads the session transcript from five call sites: token metrics,
 * session duration, speed metrics, compaction stats and thinking effort. Each
 * one re-reads and re-splits the whole file, so the transcript is walked five
 * times per repaint. Reuse keeps that to one walk.
 */
const lineCache = new Map<string, CacheEntry>();

/**
 * Identifies the file itself rather than the string used to reach it.
 *
 * @remarks
 * Windows accepts many spellings of one path, and the code mixes them: a
 * transcript path arrives with backslashes while a glob yields forward slashes.
 * Keying on the device and inode gives those one entry instead of several.
 * Inodes exceed the safe integer range, so the stat is taken as bigint.
 */
function identify(stats: fs.BigIntStats, filePath: string): string {
    // A filesystem that reports no inode leaves the path as the only identity.
    if (stats.ino === 0n) {
        return `path:${filePath}`;
    }

    return `ino:${stats.dev}:${stats.ino}`;
}

function versionOf(stats: fs.BigIntStats): string {
    return `${stats.size}:${stats.mtimeNs}`;
}

function readCached(identity: string, version: string): readonly string[] | undefined {
    const entry = lineCache.get(identity);
    return entry?.version === version ? entry.lines : undefined;
}

function writeCached(identity: string, version: string, lines: readonly string[]): readonly string[] {
    // Re-inserting moves the entry to the end, so eviction stays least-recently-written.
    lineCache.delete(identity);
    lineCache.set(identity, { version, lines });

    while (lineCache.size > MAX_CACHED_FILES) {
        const oldest = lineCache.keys().next();
        if (oldest.done) {
            break;
        }

        lineCache.delete(oldest.value);
    }

    return lines;
}

function splitJsonlContent(content: string): string[] {
    return content.trim().split('\n').filter(line => line.length > 0);
}

/**
 * Options accepted by both readers.
 */
export interface ReadJsonlLinesOptions {
    /**
     * Whether to serve and populate the shared cache. Defaults to true.
     *
     * @remarks
     * Pass false for a sweep across many transcripts. Those read each file once,
     * so caching cannot hit, and retaining their lines holds arbitrarily many
     * whole transcripts for the life of the process.
     */
    readonly cache?: boolean;
}

/**
 * Discards every cached transcript.
 *
 * @remarks
 * Exported for tests, which need to isolate cases that reuse a path.
 */
export function clearJsonlLineCache(): void {
    lineCache.clear();
}

export async function readJsonlLines(filePath: string, options?: ReadJsonlLinesOptions): Promise<readonly string[]> {
    if (options?.cache === false) {
        return splitJsonlContent(await readFile(filePath, 'utf-8'));
    }

    const stats = await stat(filePath, { bigint: true });
    const identity = identify(stats, filePath);
    const version = versionOf(stats);

    const cached = readCached(identity, version);
    if (cached !== undefined) {
        return cached;
    }

    const content = await readFile(filePath, 'utf-8');
    return writeCached(identity, version, splitJsonlContent(content));
}

export function readJsonlLinesSync(filePath: string, options?: ReadJsonlLinesOptions): readonly string[] {
    if (options?.cache === false) {
        return splitJsonlContent(readFileSync(filePath, 'utf-8'));
    }

    const stats = statSync(filePath, { bigint: true });
    const identity = identify(stats, filePath);
    const version = versionOf(stats);

    const cached = readCached(identity, version);
    if (cached !== undefined) {
        return cached;
    }

    const content = readFileSync(filePath, 'utf-8');
    return writeCached(identity, version, splitJsonlContent(content));
}

export function parseJsonlLine(line: string): unknown {
    try {
        return JSON.parse(line) as unknown;
    } catch {
        return null;
    }
}
