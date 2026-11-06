// Drives a widget editor rendered with Ink the way the line editor shows it.
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import { vi } from 'vitest';

import type { Settings } from '../../../../types/Settings';
import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../../types/Widget';

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

interface CapturedWriteStream extends NodeJS.WriteStream {
    clearOutput: () => void;
    getOutput: () => string;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        clearOutput() {
            chunks.length = 0;
        },
        getOutput() {
            return chunks.join('');
        }
    });
}

// Lets work React has already queued run first. Its scheduler runs on
// setImmediate, and it attaches input listeners in an effect just after
// drawing a frame, so a key sent as soon as the frame shows could be lost.
async function letReactCatchUp() {
    for (let turn = 0; turn < 2; turn++) {
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}

// Polls until the condition holds; a fixed delay races Ink on a busy machine
async function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    do {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        if (condition()) {
            await letReactCatchUp();
            return true;
        }
    } while (Date.now() < deadline);
    return false;
}

// Long enough for a key to be handled, for checks that it did nothing
function settle() {
    return new Promise((resolve) => {
        setTimeout(resolve, 150);
    });
}

export const ESC = '\x1b';
export const ENTER = '\r';
export const DOWN = '\x1b[B';
export const RIGHT = '\x1b[C';
export const LEFT = '\x1b[D';

/** Renders a widget's editor the way the line editor does. */
export function renderWidgetEditor(editor: React.FC<WidgetEditorProps>, widget: WidgetItem, settings?: Settings) {
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const onComplete = vi.fn<(widget: WidgetItem) => void>();
    const onCancel = vi.fn<() => void>();

    const instance = render(
        React.createElement(editor, { widget, onComplete, onCancel, settings }),
        { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
    );

    const endings = () => onComplete.mock.calls.length + onCancel.mock.calls.length;

    return {
        onComplete,
        onCancel,
        // The editor is drawn and listening for keys
        ready: async () => {
            if (!(await waitUntil(() => stdout.getOutput().length > 0))) {
                throw new Error('The editor never drew');
            }
        },
        // Every key here redraws the editor or ends it, so each waits for that
        // before the next key goes out
        press: async (...inputs: string[]) => {
            for (const input of inputs) {
                const drawn = stdout.getOutput().length;
                const ended = endings();
                stdin.write(input);
                if (!(await waitUntil(() => stdout.getOutput().length > drawn || endings() > ended))) {
                    throw new Error(`No redraw after ${JSON.stringify(input)}`);
                }
            }
        },
        // For keys that should do nothing
        pressIgnored: async (...inputs: string[]) => {
            for (const input of inputs) {
                stdin.write(input);
            }
            await settle();
        },
        // Output written since the previous call, i.e. the latest frame(s)
        takeOutput: () => {
            const output = stripAnsi(stdout.getOutput());
            stdout.clearOutput();
            return output;
        },
        // The same, with the color codes left in
        takeColoredOutput: () => {
            const output = stdout.getOutput();
            stdout.clearOutput();
            return output;
        },
        savedMetadata: () => onComplete.mock.calls.at(-1)?.[0].metadata,
        cleanup: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}
