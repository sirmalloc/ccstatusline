import type * as childProcess from 'node:child_process';
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
        '--target-version=14',
        `--outfile=${bundlePath}`
    ], { stdio: 'pipe' });
    // Reports on exit, so "lingered" catches a handle that keeps the process
    // alive after the result is in.
    fs.writeFileSync(probePath, `
        import { prefetchCustomCommandsIfNeeded, runCustomCommand, runCustomCommandAsync } from './custom-command.mjs';
        const api = process.argv[2];
        const request = JSON.parse(process.argv[3]);
        const start = Date.now();
        let result;
        if (api === 'sync') {
            result = runCustomCommand(request);
        } else if (api === 'async') {
            result = await runCustomCommandAsync(request);
        } else {
            const commands = JSON.parse(process.argv[4]);
            const results = await prefetchCustomCommandsIfNeeded(
                [commands.map(commandPath => ({ id: commandPath, type: 'custom-command', commandPath, timeout: request.timeoutMs }))],
                { data: { session_id: 'capture-test' }, terminalWidth: 120, customCommandCacheTtlSeconds: 0 }
            );
            result = results ? Array.from(results.values()) : null;
        }
        const end = Date.now();
        process.on('exit', () => {
            console.log(JSON.stringify({ result, elapsed: end - start, lingered: Date.now() - end }));
        });
    `);
    fs.writeFileSync(writerPath, `
        const fs = require('node:fs');
        const { spawn } = require('node:child_process');
        const mode = process.argv[2];
        if (mode === 'stdin') {
            process.stdout.write(fs.readFileSync(0));
        } else if (mode === 'exit') {
            process.exit(7);
        } else if (mode === 'sleep') {
            setTimeout(() => console.log('LATE'), 3000);
        } else if (mode === 'background' || mode === 'timeout-tree' || mode === 'overflow-tree') {
            spawn(process.execPath, [__filename, 'sentinel', process.argv[3], mode === 'background' ? '3000' : '1200'], {
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
            }, Number(process.argv[4]));
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

interface ProbeOutput<T> {
    result: T;
    elapsed: number;
    lingered: number;
}

function probe<T>(runtime: string, args: string[]): ProbeOutput<T> {
    const output = execFileSync(runtime, [probePath, ...args], {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(output) as ProbeOutput<T>;
}

// Polls until the file exists or the timeout passes
async function waitForFile(filePath: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!fs.existsSync(filePath) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

for (const [runtime, api] of [['bun', 'sync'], ['node', 'sync'], ['bun', 'async'], ['node', 'async']] as const) {
    describe(`custom command capture under ${runtime} (${api})`, () => {
        // A runtime's first start on a fresh CI machine can take seconds while its
        // binary is read from a cold disk. Start it once here, so that cost isn't
        // charged to whichever test happens to run it first.
        beforeAll(() => {
            execFileSync(runtime, ['-e', ''], { stdio: 'ignore', timeout: 30_000 });
        }, 30_000);

        function run(mode: string, options: { ttlSeconds?: number; timeoutMs?: number; argument?: string } = {}) {
            const command = `"${runtime}" "${writerPath}" "${mode}" "${options.argument ?? ''}"`;
            return probe<CustomCommandResult>(runtime, [api, JSON.stringify({
                command,
                input: '{"session_id":"capture-test","terminal_width":120}',
                timeoutMs: options.timeoutMs ?? 1000,
                ttlSeconds: options.ttlSeconds ?? 0
            })]);
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
            const outputPath = path.join(tempRoot, `${runtime}-${api}-unrelated-output`);
            expect(run('file', { argument: outputPath }).result).toEqual({ status: 'ok', stdout: 'OK' });
            expect(fs.statSync(outputPath).size).toBe(4 * 1024 * 1024);
        });

        it.skipIf(process.platform === 'win32')('returns successful output when a background job keeps stdout open', async () => {
            const sentinelPath = path.join(tempRoot, `${runtime}-${api}-background`);
            // The timeout leaves room for the command to start on a busy machine;
            // the background job lives 3s, well past it
            const result = run('background', { timeoutMs: 1500, argument: sentinelPath });
            expect(result.result).toEqual({ status: 'ok', stdout: 'EARLY' });
            expect(result.elapsed).toBeLessThan(3000);
            // Nor may the job keep the status line process itself alive.
            expect(result.lingered).toBeLessThan(500);
            // Let the deliberately surviving background job finish before cleanup.
            await waitForFile(sentinelPath);
            expect(fs.existsSync(sentinelPath)).toBe(true);
        });

        for (const mode of ['timeout-tree', 'overflow-tree']) {
            it.skipIf(process.platform === 'win32')(`kills descendants on ${mode}`, async () => {
                const sentinelPath = path.join(tempRoot, `${runtime}-${api}-${mode}`);
                // The overflow, not the timeout, should end overflow-tree, however
                // slowly the command starts
                const result = run(mode, { timeoutMs: mode === 'timeout-tree' ? 300 : 5000, argument: sentinelPath });
                expect(result.result).toEqual({ status: 'failed', marker: mode === 'timeout-tree' ? '[Timeout]' : '[Error]' });
                await new Promise(resolve => setTimeout(resolve, 1300));
                expect(fs.existsSync(sentinelPath)).toBe(false);
            });
        }
    });
}

for (const runtime of ['bun', 'node']) {
    describe(`custom command prefetch under ${runtime}`, () => {
        it('runs the commands concurrently', () => {
            const commands = [0, 1, 2].map(index => `sleep 0.5; echo ${index}`);
            const output = probe<CustomCommandResult[]>(runtime, ['prefetch', JSON.stringify({ timeoutMs: 5000 }), JSON.stringify(commands)]);
            expect(output.result).toEqual([0, 1, 2].map(index => ({ status: 'ok', stdout: String(index) })));
            // Serially this takes at least 1500ms.
            expect(output.elapsed).toBeLessThan(1400);
        });

        it('runs an identical command once', () => {
            const commands = ['echo $$', 'echo $$'];
            const output = probe<CustomCommandResult[]>(runtime, ['prefetch', JSON.stringify({ timeoutMs: 5000 }), JSON.stringify(commands)]);
            expect(output.result).toHaveLength(1);
        });

        it.skipIf(process.platform === 'win32')('returns at the deadline while a background job holds stdout', async () => {
            const sentinelPath = path.join(tempRoot, `${runtime}-prefetch-background`);
            const commands = ['echo fast', `"${runtime}" "${writerPath}" background "${sentinelPath}"`];
            const output = probe<CustomCommandResult[]>(runtime, ['prefetch', JSON.stringify({ timeoutMs: 200 }), JSON.stringify(commands)]);
            expect(output.result).toEqual([{ status: 'ok', stdout: 'fast' }, { status: 'ok', stdout: 'EARLY' }]);
            expect(output.elapsed).toBeLessThan(1000);
            expect(output.lingered).toBeLessThan(500);
            // Let the deliberately surviving background job finish before cleanup.
            await waitForFile(sentinelPath);
            expect(fs.existsSync(sentinelPath)).toBe(true);
        });
    });
}
