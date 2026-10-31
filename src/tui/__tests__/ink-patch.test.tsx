import {
    Box,
    Text,
    render
} from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    expect,
    it
} from 'vitest';

import { waitFor } from './helpers/wait-for-ink';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 80;
    rows = 24;

    setRawMode() { return this; }
    ref() { return this; }
    unref() { return this; }
}

// The text editors render the value split around the cursor cell. With the
// cursor at the start, as in an empty field, the part before it renders
// nothing, so the first input inserts a new string ahead of the cursor cell
// instead of changing an existing one.
function SplitField({ value, cursor }: { value: string; cursor: number }) {
    return (
        <Box>
            <Text>
                {'Command: '}
                {value.slice(0, cursor)}
                <Text inverse>{value[cursor] ?? ' '}</Text>
                {value.slice(cursor + 1)}
            </Text>
        </Box>
    );
}

it('re-measures a text when a string is inserted before its cursor cell', async () => {
    const stdin = new MockTtyStream();
    const stdout = new MockTtyStream();
    const stderr = new MockTtyStream();
    let frame = '';
    stdout.on('data', (chunk: Buffer | string) => {
        // Debug mode writes whole frames; the bare cursor hide/show writes
        // between them aren't frames
        const text = stripAnsi(chunk.toString());
        if (text !== '') {
            frame = text;
        }
    });
    const instance = render(<SplitField value='statusline' cursor={0} />, {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false
    });

    try {
        await waitFor(() => {
            expect(frame).toBe('Command: statusline');
        });

        instance.rerender(<SplitField value='npx ccusage statusline' cursor={12} />);
        await waitFor(() => {
            expect(frame).toBe('Command: npx ccusage statusline');
        });
    } finally {
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
    }
});
