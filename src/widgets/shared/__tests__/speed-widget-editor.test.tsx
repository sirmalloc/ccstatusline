import { render } from 'ink';
import { PassThrough } from 'node:stream';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { waitFor } from '../../../tui/__tests__/helpers/wait-for-ink';
import type { WidgetItem } from '../../../types/Widget';
import { OutputSpeedWidget } from '../../OutputSpeed';

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

function renderEditor(widget: WidgetItem, onComplete = vi.fn(), onCancel = vi.fn()) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        new OutputSpeedWidget().renderEditor({
            widget,
            onComplete,
            onCancel,
            action: 'edit-window'
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

// The latest prompt line ends with the window typed so far
function getTypedWindow(stdout: CapturedWriteStream): string | undefined {
    const promptLines = getPlainOutput(stdout.getOutput())
        .split('\n')
        .filter(line => line.includes('Enter window in seconds'));
    return promptLines.at(-1)?.split('):')[1]?.trim();
}

async function waitForTypedWindow(stdout: CapturedWriteStream, expected: string): Promise<void> {
    await waitFor(() => {
        expect(getTypedWindow(stdout)).toBe(expected);
    });
}

// Clears the starting 0 with backspace, then types one digit at a time
async function typeWindow(rendered: ReturnType<typeof renderEditor>, window: string): Promise<void> {
    await waitForTypedWindow(rendered.stdout, '0');
    rendered.stdin.write('\u007F');
    await waitForTypedWindow(rendered.stdout, '');

    for (let typed = 1; typed <= window.length; typed++) {
        rendered.stdin.write(window.charAt(typed - 1));
        await waitForTypedWindow(rendered.stdout, window.slice(0, typed));
    }
}

async function saveWindow(rendered: ReturnType<typeof renderEditor>): Promise<string | undefined> {
    rendered.stdin.write('\r');
    await waitFor(() => {
        expect(rendered.onComplete).toHaveBeenCalledOnce();
    });

    const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
    return updated?.metadata?.windowSeconds;
}

describe('SpeedWindowEditor', () => {
    it('shows the one-hour limit in the prompt', async () => {
        const rendered = renderEditor({ id: 'speed', type: 'output-speed' });

        try {
            await waitForTypedWindow(rendered.stdout, '0');
            expect(getPlainOutput(rendered.stdout.getOutput())).toContain('Enter window in seconds (0-3600):');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('saves a 600-second window', async () => {
        const rendered = renderEditor({ id: 'speed', type: 'output-speed' });

        try {
            await typeWindow(rendered, '600');
            expect(await saveWindow(rendered)).toBe('600');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('saves a one-hour window', async () => {
        const rendered = renderEditor({ id: 'speed', type: 'output-speed' });

        try {
            await typeWindow(rendered, '3600');
            expect(await saveWindow(rendered)).toBe('3600');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('clamps a window longer than an hour to 3600 seconds', async () => {
        const rendered = renderEditor({ id: 'speed', type: 'output-speed' });

        try {
            await typeWindow(rendered, '3601');
            expect(await saveWindow(rendered)).toBe('3600');
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('keeps a saved window when Enter is pressed without typing', async () => {
        const rendered = renderEditor({
            id: 'speed',
            type: 'output-speed',
            metadata: { windowSeconds: '120' }
        });

        try {
            await waitForTypedWindow(rendered.stdout, '120');
            expect(await saveWindow(rendered)).toBe('120');
        } finally {
            cleanupEditor(rendered);
        }
    });
});
