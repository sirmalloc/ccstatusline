import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { ColorEditingMovedNotice } from '../ColorEditingMovedNotice';

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

async function renderNotice(handlers: {
    onGoToWidgetEditor: () => void;
    onBack: () => void;
}) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        React.createElement(ColorEditingMovedNotice, handlers),
        {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        }
    );

    await flushInk();

    return {
        stdin,
        stdout,
        teardown: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

describe('ColorEditingMovedNotice', () => {
    it('tells the user color editing moved into the widget editor', async () => {
        const { stdout, teardown } = await renderNotice({
            onGoToWidgetEditor: vi.fn(),
            onBack: vi.fn()
        });

        try {
            expect(stdout.getOutput()).toContain('moved into the Widget Editor');
            expect(stdout.getOutput()).toContain('Tab');
        } finally {
            teardown();
        }
    });

    it('routes into the widget editor when the first option is selected', async () => {
        const onGoToWidgetEditor = vi.fn();
        const onBack = vi.fn();
        const { stdin, teardown } = await renderNotice({
            onGoToWidgetEditor,
            onBack
        });

        try {
            stdin.write('\r');
            await flushInk();

            expect(onGoToWidgetEditor).toHaveBeenCalledOnce();
            expect(onBack).not.toHaveBeenCalled();
        } finally {
            teardown();
        }
    });

    it('goes back when escape is pressed', async () => {
        const onGoToWidgetEditor = vi.fn();
        const onBack = vi.fn();
        const { stdin, teardown } = await renderNotice({
            onGoToWidgetEditor,
            onBack
        });

        try {
            stdin.write('\x1B');
            await flushInk();

            expect(onBack).toHaveBeenCalledOnce();
            expect(onGoToWidgetEditor).not.toHaveBeenCalled();
        } finally {
            teardown();
        }
    });
});
