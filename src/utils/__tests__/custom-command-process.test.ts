import type * as childProcess from 'child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest';

import type { CustomCommandResult } from '../custom-command';

// Run outside the test process: other suites mock child_process globally under
// Bun, and a mocked spawn cannot exercise the actual stdout resource boundary.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-command-process-'));
const bundlePath = path.join(tempRoot, 'custom-command.mjs');
const probePath = path.join(tempRoot, 'probe.mjs');
const writerPath = path.join(tempRoot, 'writer.cjs');

beforeAll(() => {
    execFileSync('bun', [
        'build',
        fileURLToPath(new URL('../custom-command.ts', import.meta.url)),
        '--target=node',
        `--outfile=${bundlePath}`
    ], { stdio: 'pipe' });
    fs.writeFileSync(probePath, `
        import { runCustomCommand } from './custom-command.mjs';
        const request = JSON.parse(process.argv[2]);
        const start = Date.now();
        const result = runCustomCommand(request);
        console.log(JSON.stringify({ result, elapsed: Date.now() - start }));
    `);
    fs.writeFileSync(writerPath, `
        const fs = require('fs');
        const { spawn } = require('child_process');
        const mode = process.argv[2];
        if (mode === 'stdin') {
            process.stdout.write(fs.readFileSync(0));
        } else if (mode === 'exit') {
            process.exit(7);
        } else if (mode === 'sleep') {
            setTimeout(() => console.log('LATE'), 3000);
        } else if (mode === 'background' || mode === 'timeout-tree' || mode === 'overflow-tree') {
            spawn(process.execPath, [__filename, 'sentinel', process.argv[3]], {
                stdio: ['ignore', 1, 'ignore']
            }).unref();
            console.log('EARLY');
            if (mode === 'timeout-tree') {
                setInterval(() => {}, 1000);
            } else if (mode === 'overflow-tree') {
                process.stdout.write(Buffer.alloc(4 * 1024 * 1024, 'x'));
                setInterval(() => {}, 1000);
            }
        } else if (mode === 'sentinel') {
            setTimeout(() => {
                fs.writeFileSync(process.argv[3], 'survived');
                console.log('LATE');
            }, 1200);
        } else if (mode === 'file') {
            fs.writeFileSync(process.argv[3], Buffer.alloc(4 * 1024 * 1024));
            console.log('OK');
        } else {
            const data = Buffer.alloc(Number(mode), process.argv[3] === 'utf8' ? 'é' : 'x');
            process.stdout.write(data);
        }
    `);
});

afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
});

for (const runtime of ['bun', 'node']) {
    describe(`custom command capture under ${runtime}`, () => {
        function run(mode: string, options: { ttlSeconds?: number; timeoutMs?: number; argument?: string } = {}) {
            const command = `"${runtime}" "${writerPath}" "${mode}" "${options.argument ?? ''}"`;
            const output = execFileSync(runtime, [probePath, JSON.stringify({
                command,
                input: '{"session_id":"capture-test","terminal_width":120}',
                timeoutMs: options.timeoutMs ?? 1000,
                ttlSeconds: options.ttlSeconds ?? 0
            })], {
                encoding: 'utf8',
                timeout: 5000,
                maxBuffer: 1024 * 1024,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            return JSON.parse(output) as { result: CustomCommandResult; elapsed: number };
        }

        for (const ttlSeconds of [0, 5]) {
            it(`rejects 4 MiB of stdout with cache TTL ${ttlSeconds}`, () => {
                expect(run(String(4 * 1024 * 1024), { ttlSeconds }).result).toEqual({ status: 'failed', marker: '[Error]' });
            });
        }

        it('accepts exactly 1 MiB and keeps the display limit', () => {
            expect(run(String(1024 * 1024)).result).toEqual({ status: 'ok', stdout: 'x'.repeat(16_384) });
        });

        it('rejects even one byte beyond the capture limit', () => {
            expect(run(String(1024 * 1024 + 1)).result).toEqual({ status: 'failed', marker: '[Error]' });
        });

        it('counts UTF-8 bytes while preserving the character display limit', () => {
            expect(run(String(1024 * 1024), { argument: 'utf8' }).result).toEqual({ status: 'ok', stdout: 'é'.repeat(16_384) });
        });

        it('delivers the stdin payload unchanged', () => {
            expect(run('stdin').result).toEqual({ status: 'ok', stdout: '{"session_id":"capture-test","terminal_width":120}' });
        });

        it('reports the command exit status', () => {
            expect(run('exit').result).toEqual({ status: 'failed', marker: '[Exit: 7]' });
        });

        it('enforces the timeout without waiting for inherited stdout', () => {
            const result = run('sleep', { timeoutMs: 200 });
            expect(result.result).toEqual({ status: 'failed', marker: '[Timeout]' });
            expect(result.elapsed).toBeLessThan(1000);
        });

        it('does not restrict unrelated files written by the command', () => {
            const outputPath = path.join(tempRoot, `${runtime}-unrelated-output`);
            expect(run('file', { argument: outputPath }).result).toEqual({ status: 'ok', stdout: 'OK' });
            expect(fs.statSync(outputPath).size).toBe(4 * 1024 * 1024);
        });

        it.skipIf(process.platform === 'win32')('returns successful output when a background job keeps stdout open', async () => {
            const sentinelPath = path.join(tempRoot, `${runtime}-background`);
            const result = run('background', { timeoutMs: 200, argument: sentinelPath });
            expect(result.result).toEqual({ status: 'ok', stdout: 'EARLY' });
            expect(result.elapsed).toBeLessThan(1000);
            // Let the deliberately surviving background job finish before cleanup.
            await new Promise(resolve => setTimeout(resolve, 1300));
            expect(fs.existsSync(sentinelPath)).toBe(true);
        });

        for (const mode of ['timeout-tree', 'overflow-tree']) {
            it.skipIf(process.platform === 'win32')(`kills descendants on ${mode}`, async () => {
                const sentinelPath = path.join(tempRoot, `${runtime}-${mode}`);
                const result = run(mode, { timeoutMs: 300, argument: sentinelPath });
                expect(result.result).toEqual({ status: 'failed', marker: mode === 'timeout-tree' ? '[Timeout]' : '[Error]' });
                await new Promise(resolve => setTimeout(resolve, 1300));
                expect(fs.existsSync(sentinelPath)).toBe(false);
            });
        }
    });
}
