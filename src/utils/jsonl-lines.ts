import * as fs from 'fs';
import { StringDecoder } from 'string_decoder';
import { promisify } from 'util';

export const JSONL_READ_CHUNK_BYTES = 1024 * 1024;
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
 * Compatibility callers can still request a materialized line array. Reuse
 * keeps repeated reads of an unchanged file to one walk, while transcript
 * analysis uses the streaming iterators directly.
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
 * Splits byte chunks using JSONL's LF delimiter without interpreting Unicode
 * line separators or lone carriage returns as record boundaries.
 */
class JsonlLineSplitter {
    private decoder = new StringDecoder('utf8');
    private readonly fragments: string[] = [];
    private hasBytesInLine = false;
    private isFirstLine = true;

    * write(chunk: Buffer): Generator<string> {
        let start = 0;
        let newline = chunk.indexOf(0x0a, start);

        while (newline !== -1) {
            this.append(chunk.subarray(start, newline));
            const line = this.finishLine();
            if (line !== null) {
                yield line;
            }

            start = newline + 1;
            newline = chunk.indexOf(0x0a, start);
        }

        this.append(chunk.subarray(start));
    }

    * end(): Generator<string> {
        if (!this.hasBytesInLine) {
            return;
        }

        const line = this.finishLine();
        if (line !== null) {
            yield line;
        }
    }

    private append(bytes: Buffer): void {
        if (bytes.length === 0) {
            return;
        }

        this.hasBytesInLine = true;
        const decoded = this.decoder.write(bytes);
        if (decoded.length > 0) {
            this.fragments.push(decoded);
        }
    }

    private finishLine(): string | null {
        const decodedTail = this.decoder.end();
        if (decodedTail.length > 0) {
            this.fragments.push(decodedTail);
        }

        let line = this.fragments.join('');
        this.fragments.length = 0;
        this.decoder = new StringDecoder('utf8');
        this.hasBytesInLine = false;

        if (this.isFirstLine) {
            this.isFirstLine = false;
            if (line.charCodeAt(0) === 0xfeff) {
                line = line.slice(1);
            }
        }

        if (line.endsWith('\r')) {
            line = line.slice(0, -1);
        }

        return line.length > 0 ? line : null;
    }
}

function decodeReverseLine(segments: Buffer[], totalBytes: number, stripBom: boolean): string | null {
    let lineBuffer: Buffer;
    if (segments.length === 1) {
        const segment = segments[0];
        if (!segment) {
            return null;
        }
        lineBuffer = segment;
    } else {
        lineBuffer = Buffer.concat(segments.slice().reverse(), totalBytes);
    }

    let line = lineBuffer.toString('utf8');
    if (stripBom && line.charCodeAt(0) === 0xfeff) {
        line = line.slice(1);
    }
    if (line.endsWith('\r')) {
        line = line.slice(0, -1);
    }

    return line.length > 0 ? line : null;
}

/**
 * Stream a JSONL file line-by-line without materializing the whole file as one
 * string. Claude Code session transcripts can exceed Node's max string length
 * (~512MB / 0x1fffffe8), so `fs.readFile(..., 'utf-8')` throws and callers that
 * catch the error end up reporting zeros.
 */
export async function* iterateJsonlLines(filePath: string): AsyncGenerator<string> {
    const stream = fs.createReadStream(filePath, { highWaterMark: JSONL_READ_CHUNK_BYTES });
    const splitter = new JsonlLineSplitter();
    // Active read errors reject the async iterator. This listener also covers a
    // late close error emitted after iterator cleanup on network filesystems.
    stream.on('error', () => undefined);

    try {
        for await (const chunk of stream as AsyncIterable<Buffer>) {
            for (const line of splitter.write(chunk)) {
                yield line;
            }
        }

        for (const line of splitter.end()) {
            yield line;
        }
    } finally {
        stream.destroy();
    }
}

/**
 * Synchronous line iterator for call sites that cannot be async.
 * Decodes chunk segments incrementally so multi-byte UTF-8 sequences and long
 * records spanning chunks remain correct without repeatedly copying prefixes.
 */
export function* iterateJsonlLinesSync(filePath: string): Generator<string> {
    const fd = fs.openSync(filePath, 'r');
    try {
        const scratch = Buffer.allocUnsafe(JSONL_READ_CHUNK_BYTES);
        const splitter = new JsonlLineSplitter();

        for (;;) {
            const bytesRead = fs.readSync(fd, scratch, 0, scratch.length, null);
            if (bytesRead === 0) {
                break;
            }

            for (const line of splitter.write(scratch.subarray(0, bytesRead))) {
                yield line;
            }
        }

        for (const line of splitter.end()) {
            yield line;
        }
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Reads JSONL records from newest to oldest without loading the whole file.
 * This is intended for widgets that only need the latest matching record.
 */
export function* iterateJsonlLinesReverseSync(filePath: string): Generator<string> {
    const fd = fs.openSync(filePath, 'r');
    try {
        let position = fs.fstatSync(fd).size;
        const segments: Buffer[] = [];
        let totalBytes = 0;

        while (position > 0) {
            const readSize = Math.min(JSONL_READ_CHUNK_BYTES, position);
            position -= readSize;

            const chunk = Buffer.allocUnsafe(readSize);
            fs.readSync(fd, chunk, 0, readSize, position);
            let end = chunk.length;
            let newline = chunk.lastIndexOf(0x0a, end - 1);

            while (newline !== -1) {
                const segment = chunk.subarray(newline + 1, end);
                if (segment.length > 0) {
                    segments.push(segment);
                    totalBytes += segment.length;
                }

                const line = decodeReverseLine(segments, totalBytes, false);
                segments.length = 0;
                totalBytes = 0;
                if (line !== null) {
                    yield line;
                }

                end = newline;
                newline = chunk.lastIndexOf(0x0a, end - 1);
            }

            if (end > 0) {
                const segment = chunk.subarray(0, end);
                segments.push(segment);
                totalBytes += segment.length;
            }
        }

        if (totalBytes > 0) {
            const line = decodeReverseLine(segments, totalBytes, true);
            if (line !== null) {
                yield line;
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
