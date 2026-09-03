import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    JSONL_READ_CHUNK_BYTES,
    clearJsonlLineCache,
    iterateJsonlLines,
    iterateJsonlLinesReverseSync,
    iterateJsonlLinesSync,
    parseJsonlLine,
    readJsonlLines,
    readJsonlLinesSync
} from '../jsonl-lines';

describe('jsonl line streaming', () => {
    const tempRoots: string[] = [];

    beforeEach(() => {
        clearJsonlLineCache();
    });

    afterEach(() => {
        clearJsonlLineCache();
        while (tempRoots.length > 0) {
            const root = tempRoots.pop();
            if (root) {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    });

    function writeTranscript(name: string, content: string): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-lines-'));
        tempRoots.push(root);
        const filePath = path.join(root, name);
        fs.writeFileSync(filePath, content);
        return filePath;
    }

    it('reads lf and crlf lines without requiring a trailing newline', async () => {
        const filePath = writeTranscript('mixed.jsonl', [
            '{"id":1}',
            '{"id":2}\r',
            '{"id":3}'
        ].join('\n'));

        await expect(readJsonlLines(filePath)).resolves.toEqual([
            '{"id":1}',
            '{"id":2}',
            '{"id":3}'
        ]);
        expect(readJsonlLinesSync(filePath, { cache: false })).toEqual([
            '{"id":1}',
            '{"id":2}',
            '{"id":3}'
        ]);
    });

    it('skips empty lines like the previous whole-file trim/split path', async () => {
        const filePath = writeTranscript('empty-lines.jsonl', '\n{"a":1}\n\n{"b":2}\n\n');

        await expect(readJsonlLines(filePath)).resolves.toEqual([
            '{"a":1}',
            '{"b":2}'
        ]);
        expect(readJsonlLinesSync(filePath, { cache: false })).toEqual([
            '{"a":1}',
            '{"b":2}'
        ]);
    });

    it('handles multi-byte utf-8 sequences that span sync read chunks', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-lines-'));
        tempRoots.push(root);
        const filePath = path.join(root, 'utf8.jsonl');

        const opening = '{"value":"';
        const emoji = '😀';
        const line = `${opening}${'x'.repeat(JSONL_READ_CHUNK_BYTES - Buffer.byteLength(opening) - 2)}${emoji}"}`;
        fs.writeFileSync(filePath, line, 'utf8');

        const lines = readJsonlLinesSync(filePath);
        expect(lines).toEqual([line]);
    });

    it('reads a record spanning many sync chunks followed by another record', () => {
        const filePath = writeTranscript('long-record.jsonl', [
            `{"value":"${'x'.repeat(6 * JSONL_READ_CHUNK_BYTES)}"}`,
            '{"value":"next"}'
        ].join('\n'));

        const lines = Array.from(iterateJsonlLinesSync(filePath));

        expect(lines).toHaveLength(2);
        expect(nth(lines, 0)).toHaveLength((6 * JSONL_READ_CHUNK_BYTES) + 12);
        expect(nth(lines, 1)).toBe('{"value":"next"}');
    });

    it('uses LF-only record boundaries consistently in async and sync readers', async () => {
        const unicodeRecord = JSON.stringify({ value: 'before\u2028middle\u2029after' });
        const filePath = writeTranscript('unicode-separators.jsonl', `${unicodeRecord}\n{"value":"next"}\n`);

        const asyncLines = await readJsonlLines(filePath, { cache: false });
        const syncLines = readJsonlLinesSync(filePath, { cache: false });

        expect(asyncLines).toEqual([unicodeRecord, '{"value":"next"}']);
        expect(syncLines).toEqual(asyncLines);
        expect(asyncLines.map(parseJsonlLine)).not.toContain(null);
    });

    it('preserves lone carriage returns as content rather than record boundaries', async () => {
        const filePath = writeTranscript('lone-cr.jsonl', 'left\rright\nnext');

        await expect(readJsonlLines(filePath, { cache: false })).resolves.toEqual([
            'left\rright',
            'next'
        ]);
        expect(readJsonlLinesSync(filePath, { cache: false })).toEqual(['left\rright', 'next']);
    });

    it('strips a UTF-8 BOM from the first record in both readers', async () => {
        const filePath = writeTranscript('bom.jsonl', '\uFEFF{"value":1}\n{"value":2}\n');

        const asyncLines = await readJsonlLines(filePath, { cache: false });
        const syncLines = readJsonlLinesSync(filePath, { cache: false });

        expect(asyncLines).toEqual(['{"value":1}', '{"value":2}']);
        expect(syncLines).toEqual(asyncLines);
        expect(asyncLines.map(parseJsonlLine)).not.toContain(null);
    });

    it('reads records from newest to oldest without loading earlier content', () => {
        const filePath = writeTranscript('reverse.jsonl', '\uFEFF{"value":1}\r\n{"value":2}\n{"value":3}');

        expect(Array.from(iterateJsonlLinesReverseSync(filePath))).toEqual([
            '{"value":3}',
            '{"value":2}',
            '{"value":1}'
        ]);
    });

    it('reverse-reads a UTF-8 record spanning multiple chunks', () => {
        const opening = '{"value":"';
        const longLine = `${opening}${'x'.repeat((2 * JSONL_READ_CHUNK_BYTES) - Buffer.byteLength(opening) - 2)}😀"}`;
        const filePath = writeTranscript('reverse-long.jsonl', `${longLine}\n{"value":"latest"}`);

        const lines = Array.from(iterateJsonlLinesReverseSync(filePath));

        expect(lines).toEqual([
            '{"value":"latest"}',
            longLine
        ]);
    });

    it('streams via async iterator without loading the full file as one string', async () => {
        const filePath = writeTranscript('stream.jsonl', [
            '{"line":1}',
            '{"line":2}',
            '{"line":3}'
        ].join('\n'));

        const seen: string[] = [];
        for await (const line of iterateJsonlLines(filePath)) {
            seen.push(line);
        }
        expect(seen).toEqual([
            '{"line":1}',
            '{"line":2}',
            '{"line":3}'
        ]);

        expect(Array.from(iterateJsonlLinesSync(filePath))).toEqual(seen);
    });

    it('streams files containing many records across multiple chunks', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-lines-'));
        tempRoots.push(root);
        const filePath = path.join(root, 'chunked.jsonl');

        const lineCount = 5000;
        const handle = fs.openSync(filePath, 'w');
        try {
            for (let i = 0; i < lineCount; i++) {
                fs.writeSync(handle, `{"i":${i},"pad":"${'z'.repeat(200)}"}\n`);
            }
        } finally {
            fs.closeSync(handle);
        }

        const lines = await readJsonlLines(filePath);
        expect(lines).toHaveLength(lineCount);
        expect(nth(lines, 0)).toBe(`{"i":0,"pad":"${'z'.repeat(200)}"}`);
        expect(nth(lines, lineCount - 1)).toBe(`{"i":${lineCount - 1},"pad":"${'z'.repeat(200)}"}`);

        const syncLines = readJsonlLinesSync(filePath);
        expect(syncLines).toHaveLength(lineCount);
    }, 30000);

    it('rejects stream open errors through the async reader', async () => {
        const missingPath = path.join(os.tmpdir(), 'ccstatusline-jsonl-lines-missing', 'missing.jsonl');

        await expect(readJsonlLines(missingPath, { cache: false })).rejects.toThrow();
    });
});

/** Matches MAX_CACHED_FILES in jsonl-lines.ts. */
const MAX_CACHED_FILES = 8;

function makeLine(value: string): string {
    return JSON.stringify({ value });
}

/** Indexed access that fails loudly, since the config forbids non-null assertions. */
function nth<T>(items: readonly T[], index: number): T {
    const item = items[index];
    if (item === undefined) {
        throw new Error(`no element at index ${index}`);
    }

    return item;
}

describe('jsonl line cache', () => {
    let tempDir: string;
    let transcript: string;

    function transcriptAt(name: string, contents: string): string {
        const filePath = path.join(tempDir, name);
        fs.writeFileSync(filePath, contents);
        return filePath;
    }

    /** Rewrites a file at a byte length and modification time of the caller's choosing. */
    function rewrite(filePath: string, contents: string, mtime: Date): void {
        fs.writeFileSync(filePath, contents);
        fs.utimesSync(filePath, mtime, mtime);
    }

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-lines-'));
        transcript = path.join(tempDir, 'session.jsonl');
        clearJsonlLineCache();
    });

    afterEach(() => {
        clearJsonlLineCache();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('splits a transcript into its non-empty lines', () => {
        fs.writeFileSync(transcript, `${makeLine('a')}\n\n${makeLine('b')}\n`);

        expect(readJsonlLinesSync(transcript)).toEqual([makeLine('a'), makeLine('b')]);
    });

    it('reuses the split lines while the file is unchanged', () => {
        fs.writeFileSync(transcript, `${makeLine('aa')}\n`);

        expect(readJsonlLinesSync(transcript)).toBe(readJsonlLinesSync(transcript));
    });

    it('re-reads once the file grows', () => {
        fs.writeFileSync(transcript, `${makeLine('a')}\n`);
        readJsonlLinesSync(transcript);

        fs.appendFileSync(transcript, `${makeLine('b')}\n`);

        expect(readJsonlLinesSync(transcript)).toEqual([makeLine('a'), makeLine('b')]);
    });

    it('re-reads when only the size changes, at a pinned modification time', () => {
        const pinned = new Date('2020-01-01T00:00:00Z');
        rewrite(transcript, `${makeLine('a')}\n`, pinned);
        readJsonlLinesSync(transcript);

        // Same mtime, different length: only size can tell these apart.
        rewrite(transcript, `${makeLine('a')}\n${makeLine('b')}\n`, pinned);

        expect(readJsonlLinesSync(transcript)).toEqual([makeLine('a'), makeLine('b')]);
    });

    it('re-reads when only the modification time changes, at a pinned size', () => {
        rewrite(transcript, `${makeLine('aa')}\n`, new Date('2020-01-01T00:00:00Z'));
        readJsonlLinesSync(transcript);

        // Same length, later mtime: only the timestamp can tell these apart.
        rewrite(transcript, `${makeLine('bb')}\n`, new Date('2021-01-01T00:00:00Z'));

        expect(readJsonlLinesSync(transcript)).toEqual([makeLine('bb')]);
    });

    it('serves one entry for the many spellings of a path', () => {
        fs.writeFileSync(transcript, `${makeLine('a')}\n`);

        // Built by hand rather than through path.join, which would normalize
        // these back into the very string they are meant to differ from.
        const base = path.basename(transcript);
        const sep = path.sep;
        const spellings = [
            transcript,
            `${tempDir}${sep}.${sep}${base}`,
            `${tempDir}${sep}${sep}${base}`
        ];

        // A backslash separates paths on Windows and is an ordinary filename
        // character elsewhere, so only Windows has the slash-direction spelling.
        if (process.platform === 'win32') {
            spellings.push(transcript.split('\\').join('/'));
        }

        const first = readJsonlLinesSync(nth(spellings, 0));

        for (const spelling of spellings.slice(1)) {
            expect(readJsonlLinesSync(spelling)).toBe(first);
        }
    });

    it('shares one entry between the sync and async readers', async () => {
        fs.writeFileSync(transcript, `${makeLine('aa')}\n`);

        const fromSync = readJsonlLinesSync(transcript);

        await expect(readJsonlLines(transcript)).resolves.toBe(fromSync);
    });

    it('re-reads after the cache is cleared', async () => {
        fs.writeFileSync(transcript, `${makeLine('aa')}\n`);
        const first = readJsonlLinesSync(transcript);

        clearJsonlLineCache();

        const second = await readJsonlLines(transcript);
        expect(second).not.toBe(first);
        expect(second).toEqual(first);
    });

    it('caches each transcript separately', () => {
        const other = transcriptAt('other.jsonl', `${makeLine('z')}\n`);
        fs.writeFileSync(transcript, `${makeLine('a')}\n`);

        const first = readJsonlLinesSync(transcript);
        readJsonlLinesSync(other);

        expect(readJsonlLinesSync(transcript)).toBe(first);
        expect(readJsonlLinesSync(other)).toEqual([makeLine('z')]);
    });

    it('keeps a second transcript when a first is written', () => {
        const other = transcriptAt('other.jsonl', `${makeLine('z')}\n`);
        const kept = readJsonlLinesSync(other);

        fs.writeFileSync(transcript, `${makeLine('a')}\n`);
        readJsonlLinesSync(transcript);

        expect(readJsonlLinesSync(other)).toBe(kept);
    });

    it('evicts the oldest entry once the cap is passed', () => {
        const paths = Array.from({ length: MAX_CACHED_FILES + 1 }, (_unused, index) => transcriptAt(`t${index}.jsonl`, `${makeLine(`v${index}`)}\n`));
        const cached = paths.slice(0, MAX_CACHED_FILES).map(filePath => readJsonlLinesSync(filePath));

        // One past the cap, which evicts the least recently written entry.
        readJsonlLinesSync(nth(paths, MAX_CACHED_FILES));

        // Assert the survivor before re-reading the evicted one, since that read re-inserts.
        expect(readJsonlLinesSync(nth(paths, 1))).toBe(nth(cached, 1));
        expect(readJsonlLinesSync(nth(paths, 0))).not.toBe(nth(cached, 0));
    });

    it('counts a rewritten entry as the most recently used', () => {
        const paths = Array.from({ length: MAX_CACHED_FILES + 1 }, (_unused, index) => transcriptAt(`r${index}.jsonl`, `${makeLine(`v${index}`)}\n`));
        for (const filePath of paths.slice(0, MAX_CACHED_FILES)) {
            readJsonlLinesSync(filePath);
        }

        // Rewriting the oldest entry should move it off the eviction block.
        fs.appendFileSync(nth(paths, 0), `${makeLine('grown')}\n`);
        const refreshed = readJsonlLinesSync(nth(paths, 0));

        readJsonlLinesSync(nth(paths, MAX_CACHED_FILES));

        expect(readJsonlLinesSync(nth(paths, 0))).toBe(refreshed);
    });

    it('retains every entry up to the cap', () => {
        const paths = Array.from({ length: MAX_CACHED_FILES }, (_unused, index) => transcriptAt(`k${index}.jsonl`, `${makeLine(`v${index}`)}\n`));
        const first = paths.map(filePath => readJsonlLinesSync(filePath));

        paths.forEach((filePath, index) => {
            expect(readJsonlLinesSync(filePath)).toBe(nth(first, index));
        });
    });

    it('does not cache when caching is disabled', () => {
        fs.writeFileSync(transcript, `${makeLine('a')}\n`);

        const first = readJsonlLinesSync(transcript, { cache: false });
        const second = readJsonlLinesSync(transcript, { cache: false });

        expect(second).not.toBe(first);
        expect(second).toEqual(first);
    });

    it('does not cache when caching is disabled on the async reader', async () => {
        fs.writeFileSync(transcript, `${makeLine('a')}\n`);

        const first = await readJsonlLines(transcript, { cache: false });
        const second = await readJsonlLines(transcript, { cache: false });

        expect(second).not.toBe(first);
        expect(second).toEqual(first);
    });

    it('does not populate the cache from an uncached read', () => {
        fs.writeFileSync(transcript, `${makeLine('a')}\n`);

        readJsonlLinesSync(transcript, { cache: false });

        // A cached read after an uncached one still has to do its own work.
        const cached = readJsonlLinesSync(transcript);
        expect(readJsonlLinesSync(transcript)).toBe(cached);
    });

    it('propagates the read failure for a missing transcript', () => {
        expect(() => readJsonlLinesSync(path.join(tempDir, 'absent.jsonl'))).toThrow();
    });

    it('serves a recreated transcript rather than the deleted one', () => {
        fs.writeFileSync(transcript, `${makeLine('a')}\n`);
        readJsonlLinesSync(transcript);

        fs.rmSync(transcript);
        fs.writeFileSync(transcript, `${makeLine('b')}\n${makeLine('c')}\n`);

        expect(readJsonlLinesSync(transcript)).toEqual([makeLine('b'), makeLine('c')]);
    });
});
