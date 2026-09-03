import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    JSONL_READ_CHUNK_BYTES,
    iterateJsonlLines,
    iterateJsonlLinesReverseSync,
    iterateJsonlLinesSync,
    parseJsonlLine
} from '../jsonl-lines';

async function collectAsync(filePath: string): Promise<string[]> {
    const lines: string[] = [];
    for await (const line of iterateJsonlLines(filePath)) {
        lines.push(line);
    }

    return lines;
}

function collectSync(filePath: string): string[] {
    return Array.from(iterateJsonlLinesSync(filePath));
}

describe('jsonl line streaming', () => {
    const tempRoots: string[] = [];

    afterEach(() => {
        vi.restoreAllMocks();
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

        await expect(collectAsync(filePath)).resolves.toEqual([
            '{"id":1}',
            '{"id":2}',
            '{"id":3}'
        ]);
        expect(collectSync(filePath)).toEqual([
            '{"id":1}',
            '{"id":2}',
            '{"id":3}'
        ]);
    });

    it('skips empty lines like the previous whole-file trim/split path', async () => {
        const filePath = writeTranscript('empty-lines.jsonl', '\n{"a":1}\n\n{"b":2}\n\n');

        await expect(collectAsync(filePath)).resolves.toEqual([
            '{"a":1}',
            '{"b":2}'
        ]);
        expect(collectSync(filePath)).toEqual([
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

        const lines = collectSync(filePath);
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

        const asyncLines = await collectAsync(filePath);
        const syncLines = collectSync(filePath);

        expect(asyncLines).toEqual([unicodeRecord, '{"value":"next"}']);
        expect(syncLines).toEqual(asyncLines);
        expect(asyncLines.map(parseJsonlLine)).not.toContain(null);
    });

    it('preserves lone carriage returns as content rather than record boundaries', async () => {
        const filePath = writeTranscript('lone-cr.jsonl', 'left\rright\nnext');

        await expect(collectAsync(filePath)).resolves.toEqual([
            'left\rright',
            'next'
        ]);
        expect(collectSync(filePath)).toEqual(['left\rright', 'next']);
    });

    it('strips a UTF-8 BOM from the first record in both readers', async () => {
        const filePath = writeTranscript('bom.jsonl', '\uFEFF{"value":1}\n{"value":2}\n');

        const asyncLines = await collectAsync(filePath);
        const syncLines = collectSync(filePath);

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

    it('never reads the file as one string, which would throw past the max string length', async () => {
        const filePath = writeTranscript('stream.jsonl', [
            '{"line":1}',
            '{"line":2}',
            '{"line":3}'
        ].join('\n'));

        const readFile = vi.spyOn(fs, 'readFile');
        const readFileSync = vi.spyOn(fs, 'readFileSync');

        const asyncLines = await collectAsync(filePath);
        const syncLines = collectSync(filePath);

        expect(asyncLines).toEqual([
            '{"line":1}',
            '{"line":2}',
            '{"line":3}'
        ]);
        expect(syncLines).toEqual(asyncLines);
        expect(readFile).not.toHaveBeenCalled();
        expect(readFileSync).not.toHaveBeenCalled();
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

        const lines = await collectAsync(filePath);
        expect(lines).toHaveLength(lineCount);
        expect(nth(lines, 0)).toBe(`{"i":0,"pad":"${'z'.repeat(200)}"}`);
        expect(nth(lines, lineCount - 1)).toBe(`{"i":${lineCount - 1},"pad":"${'z'.repeat(200)}"}`);

        const syncLines = collectSync(filePath);
        expect(syncLines).toHaveLength(lineCount);
    }, 30000);

    it('rejects stream open errors through the async reader', async () => {
        const missingPath = path.join(os.tmpdir(), 'ccstatusline-jsonl-lines-missing', 'missing.jsonl');

        await expect(collectAsync(missingPath)).rejects.toThrow();
    });
});

/** Indexed access that fails loudly, since the config forbids non-null assertions. */
function nth<T>(items: readonly T[], index: number): T {
    const item = items[index];
    if (item === undefined) {
        throw new Error(`no element at index ${index}`);
    }

    return item;
}
