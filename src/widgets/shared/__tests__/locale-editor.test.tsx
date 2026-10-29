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

import { waitFor } from '../../../tui/__tests__/helpers/wait-for-ink';
import type { WidgetItem } from '../../../types/Widget';
import { canonicalizeLocale } from '../../../utils/locales';
import {
    LOCALE_EDITOR_ACTION,
    UsageLocaleEditor
} from '../locale-editor';

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
        clearOutput() {
            chunks.length = 0;
        },
        getOutput() {
            return chunks.join('');
        }
    });
}

// The editor's first frame ends with the result count
async function waitForEditor(stdout: CapturedWriteStream): Promise<void> {
    await waitFor(() => {
        expect(stripAnsi(stdout.getOutput())).toMatch(/Showing \d+-\d+ of \d+/);
    });
}

// Types a search and waits for the redraw that shows it with the expected result
async function search(rendered: { stdin: NodeJS.ReadStream; stdout: CapturedWriteStream }, query: string, expected: string): Promise<void> {
    rendered.stdout.clearOutput();
    rendered.stdin.write(query);
    await waitFor(() => {
        expect(rendered.stdout.getOutput()).toContain(query);
        expect(rendered.stdout.getOutput()).toContain(expected);
    });
}

function renderEditor(widget: WidgetItem, onComplete = vi.fn(), onCancel = vi.fn()) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        React.createElement(UsageLocaleEditor, {
            widget,
            onComplete,
            onCancel,
            action: LOCALE_EDITOR_ACTION
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

describe('UsageLocaleEditor', () => {
    it('adds spacing between the locale list and result count', async () => {
        const rendered = renderEditor({ id: 'reset', type: 'reset-timer' });

        try {
            await waitForEditor(rendered.stdout);

            const output = getPlainOutput(rendered.stdout.getOutput());
            expect(output).toMatch(/\n\nShowing \d+-\d+ of \d+/);
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('searches common locales and saves the selected locale', async () => {
        const rendered = renderEditor({ id: 'reset', type: 'reset-timer' });

        try {
            await waitForEditor(rendered.stdout);
            await search(rendered, 'japan', 'ja-JP');

            rendered.stdin.write('\r');
            await waitFor(() => {
                expect(rendered.onComplete).toHaveBeenCalledOnce();
            });

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata?.locale).toBe('ja-JP');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('selecting the default locale clears locale metadata', async () => {
        const rendered = renderEditor({
            id: 'reset',
            type: 'reset-timer',
            metadata: { locale: 'ja-JP' }
        });

        try {
            await waitForEditor(rendered.stdout);
            await search(rendered, 'en-us', 'en-US');
            rendered.stdin.write('\r');
            await waitFor(() => {
                expect(rendered.onComplete).toHaveBeenCalledOnce();
            });

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata?.locale).toBeUndefined();
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('accepts a valid custom locale from the search query', async () => {
        const customLocale = canonicalizeLocale('en-AU');
        if (!customLocale) {
            return;
        }

        const rendered = renderEditor({ id: 'reset', type: 'reset-timer' });

        try {
            await waitForEditor(rendered.stdout);
            await search(rendered, 'en-au', `Use ${customLocale}`);

            rendered.stdin.write('\r');
            await waitFor(() => {
                expect(rendered.onComplete).toHaveBeenCalledOnce();
            });

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata?.locale).toBe(customLocale);
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('cancels without saving', async () => {
        const rendered = renderEditor({ id: 'reset', type: 'reset-timer' });

        try {
            await waitForEditor(rendered.stdout);
            rendered.stdin.write('\u001B');
            await waitFor(() => {
                expect(rendered.onCancel).toHaveBeenCalledOnce();
            });
            expect(rendered.onComplete).not.toHaveBeenCalled();
        } finally {
            cleanupEditor(rendered);
        }
    });
});
