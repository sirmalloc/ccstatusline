import {
    execSync,
    spawn
} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import {
    beforeAll,
    describe,
    expect,
    it
} from 'vitest';

import {
    flushStdout,
    isCompleteJson,
    readStdinBun,
    readStdinNode
} from '../stdin';

describe('isCompleteJson', () => {
    it('returns true for a single-line JSON object', () => {
        expect(isCompleteJson('{"hello":"world"}')).toBe(true);
        expect(isCompleteJson('{"key": 123, "bool": true}')).toBe(true);
    });

    it('returns true for a multi-line formatted JSON object with trailing newline', () => {
        const multiline = '{\n  "model": {\n    "id": "claude-sonnet-4-5"\n  }\n}\n';
        expect(isCompleteJson(multiline)).toBe(true);
    });

    it('returns true for JSON arrays', () => {
        expect(isCompleteJson('[1, 2, 3]')).toBe(true);
        expect(isCompleteJson('[{"name": "test"}]')).toBe(true);
    });

    it('returns false for empty or whitespace-only input', () => {
        expect(isCompleteJson('')).toBe(false);
        expect(isCompleteJson('   \n\t  ')).toBe(false);
    });

    it('returns false for partial or incomplete JSON', () => {
        expect(isCompleteJson('{"hello":')).toBe(false);
        expect(isCompleteJson('{"hello":"world"')).toBe(false);
        expect(isCompleteJson('{"outer":{"inner":1}')).toBe(false);
        expect(isCompleteJson('[1, 2,')).toBe(false);
    });

    it('returns false when closing brace is inside a string literal', () => {
        expect(isCompleteJson('{"key":"value}"')).toBe(false);
        expect(isCompleteJson('{"key":"}", "more":')).toBe(false);
    });

    it('returns false for arbitrary non-JSON text', () => {
        expect(isCompleteJson('hello world')).toBe(false);
        expect(isCompleteJson('statusline output')).toBe(false);
    });
});

describe('readStdinNode', () => {
    it('reads complete input when EOF arrives normally', async () => {
        const stream = new PassThrough();
        const readPromise = readStdinNode({ idleTimeoutMs: 1000, inputStream: stream });

        stream.write('{"status": "ok"}');
        stream.end();

        const result = await readPromise;
        expect(result).toBe('{"status": "ok"}');
    });

    it('resolves immediately on complete JSON even when stream has no EOF', async () => {
        const stream = new PassThrough();
        const start = Date.now();
        const readPromise = readStdinNode({ idleTimeoutMs: 1000, inputStream: stream });

        stream.write('{"model": "opus", "active": true}');
        // Notice stream.end() is NEVER called - simulating Windows Volta shim hang

        const result = await readPromise;
        const elapsed = Date.now() - start;

        expect(result).toBe('{"model": "opus", "active": true}');
        expect(elapsed).toBeLessThan(500);
    });

    it('resets idle timer on chunked input and resolves when JSON is complete without truncation', async () => {
        const stream = new PassThrough();
        const start = Date.now();
        // Set short idle timeout (150ms) to verify that chunks arriving within 150ms
        // reset the timer and do not get prematurely destroyed
        const readPromise = readStdinNode({ idleTimeoutMs: 150, inputStream: stream });

        stream.write('{"chunk1": 1');
        await new Promise((r) => {
            setTimeout(r, 80);
        });
        stream.write(', "chunk2": 2');
        await new Promise((r) => {
            setTimeout(r, 80);
        });
        stream.write(', "chunk3": 3}');

        const result = await readPromise;
        const elapsed = Date.now() - start;

        // Total time is > 160ms (longer than the 150ms idleTimeout), proving the timer reset
        expect(result).toBe('{"chunk1": 1, "chunk2": 2, "chunk3": 3}');
        expect(elapsed).toBeGreaterThanOrEqual(140);
        expect(elapsed).toBeLessThan(1000);
    });

    it('resolves on idle timeout when stream is held open with non-JSON data', async () => {
        const stream = new PassThrough();
        const start = Date.now();
        const readPromise = readStdinNode({ idleTimeoutMs: 100, inputStream: stream });

        stream.write('non-json-plain-text');
        // No stream.end()

        const result = await readPromise;
        const elapsed = Date.now() - start;

        expect(result).toBe('non-json-plain-text');
        expect(elapsed).toBeGreaterThanOrEqual(90);
        expect(elapsed).toBeLessThan(600);
    });

    it('destroys input stream upon completion to unblock libuv event loop', async () => {
        const stream = new PassThrough();
        let destroyed = false;
        stream.on('close', () => {
            destroyed = true;
        });

        const readPromise = readStdinNode({ idleTimeoutMs: 1000, inputStream: stream });
        stream.write('{"done": true}');

        await readPromise;
        expect(destroyed).toBe(true);
    });
});

describe('readStdinBun', () => {
    it('reads complete input when EOF arrives normally', async () => {
        const webStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"bun": "ok"}'));
                controller.close();
            }
        });

        const result = await readStdinBun({ idleTimeoutMs: 1000, stream: webStream });
        expect(result).toBe('{"bun": "ok"}');
    });

    it('resolves immediately on complete JSON even when Bun stream has no EOF', async () => {
        let streamCancelled = false;
        const start = Date.now();
        const webStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"bun_volta_fix": true}'));
                // Do not close controller
            },
            cancel() {
                streamCancelled = true;
            }
        });

        const result = await readStdinBun({ idleTimeoutMs: 1000, stream: webStream });
        const elapsed = Date.now() - start;

        expect(result).toBe('{"bun_volta_fix": true}');
        expect(elapsed).toBeLessThan(500);
        expect(streamCancelled).toBe(true);
    });

    it('resets idle timer on chunked input in Bun stream and preserves full output', async () => {
        const start = Date.now();
        const encoder = new TextEncoder();
        let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

        const webStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controllerRef = controller;
            }
        });

        const readPromise = readStdinBun({ idleTimeoutMs: 150, stream: webStream });

        controllerRef?.enqueue(encoder.encode('{"part1": "a"'));
        await new Promise((r) => {
            setTimeout(r, 80);
        });
        controllerRef?.enqueue(encoder.encode(', "part2": "b"}'));

        const result = await readPromise;
        const elapsed = Date.now() - start;

        expect(result).toBe('{"part1": "a", "part2": "b"}');
        expect(elapsed).toBeGreaterThanOrEqual(70);
        expect(elapsed).toBeLessThan(1000);
    });

    it('resolves on idle timeout in Bun when non-JSON data is held open', async () => {
        let streamCancelled = false;
        const start = Date.now();
        const webStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('raw-hook-data'));
                // Do not close controller
            },
            cancel() {
                streamCancelled = true;
            }
        });

        const result = await readStdinBun({ idleTimeoutMs: 100, stream: webStream });
        const elapsed = Date.now() - start;

        expect(result).toBe('raw-hook-data');
        expect(elapsed).toBeGreaterThanOrEqual(90);
        expect(elapsed).toBeLessThan(600);
        expect(streamCancelled).toBe(true);
    });
});

describe('flushStdout', () => {
    it('resolves cleanly without error', async () => {
        await expect(flushStdout()).resolves.toBeUndefined();
    });
});

describe('subprocess stdin handling and non-truncated output', () => {
    const payload = JSON.stringify({
        model: { id: 'claude-sonnet-4-5-20250929', display_name: 'Sonnet 4.5' },
        cost: { total_cost_usd: 0.05, total_duration_ms: 12000 }
    });
    const scriptPath = path.resolve(__dirname, '../../../dist/ccstatusline.js');
    const nodeBin = process.env.NODE ?? 'node';

    beforeAll(() => {
        if (!fs.existsSync(scriptPath)) {
            execSync('bun build src/ccstatusline.ts --target=node --outfile=dist/ccstatusline.js --target-version=14', {
                cwd: path.resolve(__dirname, '../../..'),
                stdio: 'ignore'
            });
        }
    });

    it('renders full output in Node and exits promptly when stdin is held open without EOF', async () => {
        expect(fs.existsSync(scriptPath)).toBe(true);

        const start = Date.now();
        const proc = spawn(nodeBin, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

        let stdout = '';
        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });

        proc.stdin.write(payload);
        // Stdin pipe held open without calling end()

        const exitCode = await new Promise<number | null>((resolve) => {
            proc.on('close', resolve);
        });

        const elapsed = Date.now() - start;
        expect(exitCode).toBe(0);
        expect(elapsed).toBeLessThan(4000);
        expect(stdout.length).toBeGreaterThan(0);
        const normalizedStdout = stdout.replace(/\u00A0/g, ' ');
        expect(normalizedStdout).toContain('Sonnet 4.5');
    }, 10000);

    it('renders full output in Bun and exits promptly when stdin is held open without EOF', async () => {
        const tsPath = path.resolve(__dirname, '../../ccstatusline.ts');
        const start = Date.now();
        const proc = spawn('bun', ['run', tsPath], { stdio: ['pipe', 'pipe', 'pipe'] });

        let stdout = '';
        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });

        proc.stdin.write(payload);
        // Stdin pipe held open without calling end()

        const exitCode = await new Promise<number | null>((resolve) => {
            proc.on('close', resolve);
        });

        const elapsed = Date.now() - start;
        expect(exitCode).toBe(0);
        expect(elapsed).toBeLessThan(4000);
        expect(stdout.length).toBeGreaterThan(0);
        const normalizedStdout = stdout.replace(/\u00A0/g, ' ');
        expect(normalizedStdout).toContain('Sonnet 4.5');
    }, 10000);

    it('does not truncate output when data is piped slowly in chunks', async () => {
        expect(fs.existsSync(scriptPath)).toBe(true);

        const proc = spawn(nodeBin, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

        let stdout = '';
        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });

        const part1 = payload.slice(0, 20);
        const part2 = payload.slice(20);

        proc.stdin.write(part1);
        await new Promise((r) => {
            setTimeout(r, 100);
        });
        proc.stdin.write(part2);
        // Do not call proc.stdin.end()

        const exitCode = await new Promise<number | null>((resolve) => {
            proc.on('close', resolve);
        });

        expect(exitCode).toBe(0);
        expect(stdout.length).toBeGreaterThan(0);
        const normalizedStdout = stdout.replace(/\u00A0/g, ' ');
        expect(normalizedStdout).toContain('Sonnet 4.5');
    }, 10000);
});
