import * as fs from 'fs';
import { createInterface } from 'node:readline';
import { promisify } from 'util';

const SYNC_READ_CHUNK_BYTES = 1024 * 1024;
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
 * Several consumers require the same materialized transcript lines during one
 * render. Reuse keeps those consumers to one file walk, while aggregation-only
 * consumers can use the streaming iterators directly.
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

/**
 * Stream a JSONL file line-by-line without materializing the whole file as one
 * string. Claude Code session transcripts can exceed Node's max string length
 * (~512MB / 0x1fffffe8), so `fs.readFile(..., 'utf-8')` throws and callers that
 * catch the error end up reporting zeros.
 */
export async function* iterateJsonlLines(filePath: string): AsyncGenerator<string> {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const reader = createInterface({
        input: stream,
        crlfDelay: Infinity
    });

    try {
        for await (const line of reader) {
            if (line.length > 0) {
                yield line;
            }
        }
    } finally {
        reader.close();
        stream.destroy();
    }
}

/**
 * Synchronous line iterator for call sites that cannot be async.
 * Buffers chunk segments until a line is complete, then decodes the assembled
 * Buffer so multi-byte UTF-8 sequences are never split across chunk boundaries.
 */
export function* iterateJsonlLinesSync(filePath: string): Generator<string> {
    const fd = fs.openSync(filePath, 'r');
    try {
        const scratch = Buffer.allocUnsafe(SYNC_READ_CHUNK_BYTES);
        const pending: Buffer[] = [];
        let pendingBytes = 0;

        for (;;) {
            const bytesRead = fs.readSync(fd, scratch, 0, scratch.length, null);
            if (bytesRead === 0) {
                break;
            }

            const chunk = scratch.subarray(0, bytesRead);
            let start = 0;

            for (let i = 0; i < chunk.length; i++) {
                if (chunk[i] !== 0x0a) {
                    continue;
                }

                const segment = chunk.subarray(start, i);
                let lineBuf: Buffer;
                if (pending.length === 0) {
                    lineBuf = segment;
                } else {
                    if (segment.length > 0) {
                        pending.push(segment);
                        pendingBytes += segment.length;
                    }
                    lineBuf = Buffer.concat(pending, pendingBytes);
                }

                pending.length = 0;
                pendingBytes = 0;
                start = i + 1;

                if (lineBuf.length > 0 && lineBuf[lineBuf.length - 1] === 0x0d) {
                    lineBuf = lineBuf.subarray(0, lineBuf.length - 1);
                }
                if (lineBuf.length > 0) {
                    yield lineBuf.toString('utf8');
                }
            }

            if (start < chunk.length) {
                const remainder = Buffer.from(chunk.subarray(start));
                pending.push(remainder);
                pendingBytes += remainder.length;
            }
        }

        if (pendingBytes > 0) {
            let lineBuf = Buffer.concat(pending, pendingBytes);
            if (lineBuf[lineBuf.length - 1] === 0x0d) {
                lineBuf = lineBuf.subarray(0, lineBuf.length - 1);
            }
            if (lineBuf.length > 0) {
                yield lineBuf.toString('utf8');
            }
        }
    } finally {
        fs.closeSync(fd);
    }
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
    const readLines = async (): Promise<string[]> => {
        const lines: string[] = [];
        for await (const line of iterateJsonlLines(filePath)) {
            lines.push(line);
        }
        return lines;
    };

    if (options?.cache === false) {
        return readLines();
    }

    const stats = await stat(filePath, { bigint: true });
    const identity = identify(stats, filePath);
    const version = versionOf(stats);

    const cached = readCached(identity, version);
    if (cached !== undefined) {
        return cached;
    }

    return writeCached(identity, version, await readLines());
}

export function readJsonlLinesSync(filePath: string, options?: ReadJsonlLinesOptions): readonly string[] {
    if (options?.cache === false) {
        return Array.from(iterateJsonlLinesSync(filePath));
    }

    const stats = statSync(filePath, { bigint: true });
    const identity = identify(stats, filePath);
    const version = versionOf(stats);

    const cached = readCached(identity, version);
    if (cached !== undefined) {
        return cached;
    }

    return writeCached(identity, version, Array.from(iterateJsonlLinesSync(filePath)));
}

export function parseJsonlLine(line: string): unknown {
    try {
        return JSON.parse(line) as unknown;
    } catch {
        return null;
    }
}
