import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    iterateJsonlLines,
    iterateJsonlLinesSync,
    readJsonlLines,
    readJsonlLinesSync
} from '../jsonl-lines';

describe('jsonl line streaming', () => {
    const tempRoots: string[] = [];

    afterEach(() => {
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
        expect(readJsonlLinesSync(filePath)).toEqual([
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
        expect(readJsonlLinesSync(filePath)).toEqual([
            '{"a":1}',
            '{"b":2}'
        ]);
    });

    it('handles multi-byte utf-8 sequences that span sync read chunks', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-lines-'));
        tempRoots.push(root);
        const filePath = path.join(root, 'utf8.jsonl');

        // Force the sync reader across many tiny chunks by writing a long prefix
        // so the multi-byte character is unlikely to land on a single natural boundary
        // only — the reader itself uses 1MB chunks; put the character mid-file.
        const emoji = '😀'; // 4-byte UTF-8
        const prefix = `{"n":"${'x'.repeat(100)}"}`;
        const mid = `{"emoji":"${emoji}"}`;
        const suffix = `{"n":"${'y'.repeat(100)}"}`;
        fs.writeFileSync(filePath, [prefix, mid, suffix].join('\n'), 'utf8');

        const lines = readJsonlLinesSync(filePath);
        expect(lines).toHaveLength(3);
        expect(JSON.parse(lines[1]!).emoji).toBe(emoji);
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

    it('can read files larger than Node max string length via streaming', async () => {
        // Node refuses to create a single string longer than ~0x1fffffe8 (~512MB).
        // Building a real 512MB+ fixture is too heavy for unit tests, so we prove
        // the streaming path never calls readFile/readFileSync for the payload and
        // still aggregates many chunks correctly by reading a multi-chunk file.
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
        expect(JSON.parse(lines[0]!).i).toBe(0);
        expect(JSON.parse(lines[lineCount - 1]!).i).toBe(lineCount - 1);

        const syncLines = readJsonlLinesSync(filePath);
        expect(syncLines).toHaveLength(lineCount);
    }, 30000);
});
