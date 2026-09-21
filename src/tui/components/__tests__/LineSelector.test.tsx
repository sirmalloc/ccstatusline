import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import { LineSelector } from '../LineSelector';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 160;
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
            return chunks.join('');
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

describe('LineSelector', () => {
    const lines: WidgetItem[][] = [
        [{ id: '1', type: 'model' }],
        [{ id: '2', type: 'git-branch' }]
    ];

    it('switches screen on Tab, carrying the highlighted row', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onSwitchScreen = vi.fn();

        const instance = render(
            React.createElement(LineSelector, {
                lines,
                onSelect: vi.fn(),
                onBack: vi.fn(),
                onLinesUpdate: vi.fn(),
                onSwitchScreen,
                allowEditing: true,
                title: 'Select Line to Edit Items'
            }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await flushInk();
            stdin.write('\t');
            await flushInk();
            expect(onSwitchScreen).toHaveBeenCalledWith(0);

            stdin.write('\x1B[B'); // arrow down -> highlight row 1
            await flushInk();
            stdin.write('\t');
            await flushInk();
            expect(onSwitchScreen).toHaveBeenLastCalledWith(1);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('does not switch on Tab when no handler is provided', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onBack = vi.fn();

        const instance = render(
            React.createElement(LineSelector, {
                lines,
                onSelect: vi.fn(),
                onBack,
                onLinesUpdate: vi.fn(),
                allowEditing: true,
                title: 'Select Line to Edit Items'
            }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await flushInk();
            stdin.write('\t');
            await flushInk();
            expect(onBack).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
