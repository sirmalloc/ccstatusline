import * as fs from 'fs';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import * as os from 'os';
import * as path from 'path';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { ImportConfigDialog } from '../ImportConfigDialog';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        getOutput() {
            return stripAnsi(chunks.join(''));
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
        await flushInk();
    }
}

function latestFrame(stdout: CapturedWriteStream): string {
    return stdout.getOutput().split('Import Config').at(-1) ?? '';
}

let tmpDir: string;

beforeEach(() => {
    // realpath: on macOS os.tmpdir() is a symlink and the picker may emit resolved paths.
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccsl-import-')));
    fs.mkdirSync(path.join(tmpDir, 'single'));
    fs.writeFileSync(path.join(tmpDir, 'single', 'only.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'nested'));
    fs.writeFileSync(path.join(tmpDir, 'a.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'nested', 'b.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'UPPER.JSON'), '{}');
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ImportConfigDialog', () => {
    it('case 1: lists entries but filters non-JSON files', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: tmpDir,
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('a.json'));

            const frame = latestFrame(stdout);
            expect(frame).toContain('a.json');
            expect(frame).toContain('nested');
            expect(frame).not.toContain('notes.txt');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 2: selects a file when only one entry exists', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: path.join(tmpDir, 'single'),
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('only.json'));

            stdin.write('\r');
            await waitFor(() => onFileChosen.mock.calls.length > 0);

            expect(onFileChosen).toHaveBeenCalledTimes(1);
            expect(onFileChosen).toHaveBeenCalledWith(path.join(tmpDir, 'single', 'only.json'));
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 2b: double-submit guard prevents calling onFileChosen twice', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: path.join(tmpDir, 'single'),
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('only.json'));

            // Two separate Enter events; a single '\r\r' chunk would not parse as two keypresses.
            stdin.write('\r');
            await waitFor(() => onFileChosen.mock.calls.length > 0);
            stdin.write('\r');
            await flushInk();

            expect(onFileChosen).toHaveBeenCalledTimes(1);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 3: esc in browse mode calls onCancel', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: tmpDir,
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('a.json'));

            stdin.write('\u001B');
            await waitFor(() => onCancel.mock.calls.length > 0);

            expect(onCancel).toHaveBeenCalledTimes(1);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 4: typed path in Ctrl+T mode selects a file', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: tmpDir,
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('a.json'));

            // Enter path mode with Ctrl+T
            stdin.write('\u0014');
            await waitFor(() => latestFrame(stdout).includes('Path:'));

            const pathFrame = latestFrame(stdout);
            expect(pathFrame).toContain('Path:');
            // Verify picker's filter input is not active (no typing should filter the picker)
            expect(pathFrame).not.toContain('Filter:');

            // Type the relative path
            stdin.write('nested/b.json');
            await flushInk();

            // Press Enter to select
            stdin.write('\r');
            await waitFor(() => onFileChosen.mock.calls.length > 0);

            expect(onFileChosen).toHaveBeenCalledTimes(1);
            expect(onFileChosen).toHaveBeenCalledWith(path.join(tmpDir, 'nested', 'b.json'));
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 5: esc in path mode returns to browse without calling onCancel', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: tmpDir,
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('a.json'));

            // Enter path mode
            stdin.write('\u0014');
            await waitFor(() => latestFrame(stdout).includes('Path:'));

            // Press Escape to return to browse
            stdin.write('\u001B');
            await waitFor(() => !latestFrame(stdout).includes('Path:'));

            const frame = latestFrame(stdout);
            expect(frame).toContain('[Ctrl+T] type path');
            expect(frame).not.toContain('Path:');
            expect(onCancel).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 6: path prefill tracks directory navigation', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: tmpDir,
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('a.json'));

            // Type 'nested' to filter and focus it
            stdin.write('nested');
            // Wait until the type-ahead filter has hidden the other entries, so `nested` is focused.
            await waitFor(() => !latestFrame(stdout).includes('a.json'));

            // Press Enter to open the directory
            stdin.write('\r');
            await waitFor(() => latestFrame(stdout).includes('b.json'));

            // Enter path mode with Ctrl+T
            stdin.write('\u0014');
            await waitFor(() => latestFrame(stdout).includes('Path:'));

            const frame = latestFrame(stdout);
            const pathLine = frame.split('\n').find(line => line.includes('Path:')) ?? '';
            expect(pathLine).toContain('nested');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 7: uppercase file extensions are recognized', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: tmpDir,
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('UPPER.JSON'));

            const frame = latestFrame(stdout);
            expect(frame).toContain('UPPER.JSON');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('case 8: entries render on separate lines (column layout regression)', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onFileChosen = vi.fn();
        const onCancel = vi.fn();

        const instance = render(
            React.createElement(ImportConfigDialog, {
                initialDir: tmpDir,
                onFileChosen,
                onCancel
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await waitFor(() => latestFrame(stdout).includes('UPPER.JSON'));

            const frame = latestFrame(stdout);
            const lines = frame.split('\n');
            const aLine = lines.find(line => line.includes('a.json')) ?? '';
            const nestedLine = lines.find(line => line.includes('nested')) ?? '';
            expect(aLine).toContain('a.json');
            expect(aLine).not.toContain('nested');
            expect(aLine).not.toContain('UPPER.JSON');
            expect(nestedLine).not.toContain('UPPER.JSON');
            expect(frame).toContain('▶');
            expect(frame).toContain('Folder:');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
