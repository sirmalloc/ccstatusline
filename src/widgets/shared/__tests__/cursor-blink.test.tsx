import {
    Text,
    render
} from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    expect,
    it,
    vi
} from 'vitest';

import { waitFor } from '../../../tui/__tests__/helpers/wait-for-ink';
import { useCursorBlink } from '../cursor-blink';
import { useTextCursor } from '../text-cursor';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 80;
    rows = 24;

    setRawMode() { return this; }
    ref() { return this; }
    unref() { return this; }
}

function BlinkProbe() {
    const visible = useCursorBlink();
    return <Text>{`${visible ? '[visible]' : '[hidden]'}abc`}</Text>;
}

function TextCursorEditor() {
    const { display } = useTextCursor('abc');
    return <Text>{`"${display}"`}</Text>;
}

it.each([
    { name: 'shared cursor timer', element: <BlinkProbe />, highlight: '[visible]', text: 'abc' },
    { name: 'text editor', element: <TextCursorEditor />, highlight: '\x1b[7m', text: '"abc "' }
])('$name blinks without moving text, resets on input, and cleans up on unmount', async ({ element, highlight, text }) => {
    const stdin = new MockTtyStream();
    const stdout = new MockTtyStream();
    const stderr = new MockTtyStream();
    let frame = '';
    stdout.on('data', (chunk: Buffer | string) => {
        frame = chunk.toString();
    });
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const instance = render(element, {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false
    });

    const expectVisible = () => {
        expect(frame).toContain(highlight);
        expect(stripAnsi(frame)).toContain(text);
    };
    const expectHidden = () => {
        expect(frame).not.toContain(highlight);
        expect(stripAnsi(frame)).toContain(text);
    };

    try {
        await waitFor(expectVisible);
        await waitFor(expectHidden);
        await waitFor(expectVisible);
        await waitFor(expectHidden);

        // A keypress resets blinking even when it doesn't change the value or position.
        stdin.write('\u001B[C');
        await waitFor(expectVisible, 300);
        await waitFor(expectHidden);
    } finally {
        const lastBlinkIndex = intervals.mock.calls.findLastIndex(args => args[1] === 500);
        const lastTimer: unknown = intervals.mock.results[lastBlinkIndex]?.value;
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
        try {
            expect(lastTimer).toBeDefined();
            expect(clear).toHaveBeenCalledWith(lastTimer);
        } finally {
            intervals.mockRestore();
            clear.mockRestore();
        }
    }
});
