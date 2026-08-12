import * as fs from 'fs';
import { createInterface } from 'node:readline';

const SYNC_READ_CHUNK_BYTES = 1024 * 1024;

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
 * Completes each line in a Buffer before decoding so multi-byte UTF-8 sequences
 * are never split across chunk boundaries.
 */
export function* iterateJsonlLinesSync(filePath: string): Generator<string> {
    const fd = fs.openSync(filePath, 'r');
    try {
        const scratch = Buffer.allocUnsafe(SYNC_READ_CHUNK_BYTES);
        let pending = Buffer.alloc(0);

        for (;;) {
            const bytesRead = fs.readSync(fd, scratch, 0, scratch.length, null);
            if (bytesRead === 0) {
                break;
            }

            const chunk = scratch.subarray(0, bytesRead);
            const combined = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
            let start = 0;

            for (let i = 0; i < combined.length; i++) {
                if (combined[i] !== 0x0a) {
                    continue;
                }

                let lineBuf = combined.subarray(start, i);
                if (lineBuf.length > 0 && lineBuf[lineBuf.length - 1] === 0x0d) {
                    lineBuf = lineBuf.subarray(0, lineBuf.length - 1);
                }
                if (lineBuf.length > 0) {
                    yield lineBuf.toString('utf8');
                }
                start = i + 1;
            }

            pending = start === 0
                ? Buffer.from(combined)
                : Buffer.from(combined.subarray(start));
        }

        if (pending.length > 0) {
            let lineBuf = pending;
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

export async function readJsonlLines(filePath: string): Promise<string[]> {
    const lines: string[] = [];
    for await (const line of iterateJsonlLines(filePath)) {
        lines.push(line);
    }
    return lines;
}

export function readJsonlLinesSync(filePath: string): string[] {
    return Array.from(iterateJsonlLinesSync(filePath));
}

export function parseJsonlLine(line: string): unknown {
    try {
        return JSON.parse(line) as unknown;
    } catch {
        return null;
    }
}
