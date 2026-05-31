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

import type { WidgetItem } from '../../../types/Widget';
import {
    TIMEZONE_EDITOR_ACTION,
    UsageTimezoneEditor
} from '../timezone-editor';

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
            return chunks.join('');
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

function renderEditor(widget: WidgetItem, onComplete = vi.fn(), onCancel = vi.fn()) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        React.createElement(UsageTimezoneEditor, {
            widget,
            onComplete,
            onCancel,
            action: TIMEZONE_EDITOR_ACTION
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

    return {
        instance,
        stdin,
        stdout,
        stderr,
        onComplete,
        onCancel
    };
}

function cleanupEditor(rendered: ReturnType<typeof renderEditor>): void {
    rendered.instance.unmount();
    rendered.instance.cleanup();
    rendered.stdin.destroy();
    rendered.stdout.destroy();
    rendered.stderr.destroy();
}

function getPlainOutput(output: string): string {
    return stripAnsi(output).replace(/\r\n/g, '\n');
}

describe('UsageTimezoneEditor', () => {
    it('adds spacing between the timezone list and result count', async () => {
        const rendered = renderEditor({ id: 'reset', type: 'reset-timer' });

        try {
            await flushInk();

            const output = getPlainOutput(rendered.stdout.getOutput());
            expect(output).toMatch(/IANA timezone\n\nShowing \d+-\d+ of \d+/);
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('searches native timezones and saves the selected timezone', async () => {
        if (typeof Intl.supportedValuesOf !== 'function') {
            return;
        }

        const rendered = renderEditor({ id: 'reset', type: 'reset-timer' });

        try {
            await flushInk();
            rendered.stdin.write('tokyo');
            await flushInk();

            expect(rendered.stdout.getOutput()).toContain('Asia/Tokyo');

            rendered.stdin.write('\r');
            await flushInk();

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata?.timezone).toBe('Asia/Tokyo');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('selecting UTC clears timezone metadata', async () => {
        const rendered = renderEditor({
            id: 'reset',
            type: 'reset-timer',
            metadata: { timezone: 'Asia/Tokyo' }
        });

        try {
            await flushInk();
            rendered.stdin.write('utc');
            await flushInk();
            rendered.stdin.write('\r');
            await flushInk();

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata?.timezone).toBeUndefined();
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('cancels without saving', async () => {
        const rendered = renderEditor({ id: 'reset', type: 'reset-timer' });

        try {
            await flushInk();
            rendered.stdin.write('\u001B');
            await flushInk();

            expect(rendered.onCancel).toHaveBeenCalledOnce();
            expect(rendered.onComplete).not.toHaveBeenCalled();
        } finally {
            cleanupEditor(rendered);
        }
    });
});
