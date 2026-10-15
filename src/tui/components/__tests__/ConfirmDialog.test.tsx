import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { ConfirmDialog } from '../ConfirmDialog';

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

describe('ConfirmDialog', () => {
    it('shows Yes/No only and cancels with the second option', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        const instance = render(
            React.createElement(ConfirmDialog, {
                message: 'Replace it?',
                onConfirm,
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
            await flushInk();

            const output = stdout.getOutput();
            expect(output).toContain('Yes');
            expect(output).toContain('No');
            expect(output).not.toContain('Cancel');

            stdin.write('\u001B[B');
            await flushInk();
            stdin.write('\r');
            await flushInk();

            expect(onCancel).toHaveBeenCalledTimes(1);
            expect(onConfirm).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('offers the additional action between Yes and Cancel', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        const onSelect = vi.fn();
        const instance = render(
            React.createElement(ConfirmDialog, {
                message: 'A status line is already configured. Replace it?',
                onConfirm,
                onCancel,
                additionalAction: {
                    label: 'Keep existing',
                    onSelect
                }
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
            await flushInk();

            const output = stdout.getOutput();
            expect(output).toContain('Keep existing');
            expect(output).toContain('Cancel');
            expect(output).not.toContain('No');

            stdin.write('\u001B[B');
            await flushInk();
            stdin.write('\r');
            await flushInk();

            expect(onSelect).toHaveBeenCalledTimes(1);
            expect(onConfirm).not.toHaveBeenCalled();
            expect(onCancel).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('reaches Cancel below the additional action', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        const onSelect = vi.fn();
        const instance = render(
            React.createElement(ConfirmDialog, {
                message: 'Replace it?',
                onConfirm,
                onCancel,
                additionalAction: {
                    label: 'Keep existing',
                    onSelect
                }
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
            await flushInk();

            stdin.write('\u001B[B');
            await flushInk();
            stdin.write('\u001B[B');
            await flushInk();
            stdin.write('\r');
            await flushInk();

            expect(onCancel).toHaveBeenCalledTimes(1);
            expect(onSelect).not.toHaveBeenCalled();
            expect(onConfirm).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
