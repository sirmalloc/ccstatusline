import { render } from 'ink';
import { PassThrough } from 'node:stream';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { waitFor } from '../../tui/__tests__/helpers/wait-for-ink';
import type { WidgetItem } from '../../types/Widget';
import { CustomCommandWidget } from '../CustomCommand';

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
        new CustomCommandWidget().renderEditor({
            widget,
            onComplete,
            onCancel,
            action: 'edit-ttl'
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

const item: WidgetItem = { id: 'command', type: 'custom-command', commandPath: 'printf hello' };

async function waitForTtl(rendered: ReturnType<typeof renderEditor>, expected: string): Promise<void> {
    await waitFor(() => {
        const prompt = getPlainOutput(rendered.stdout.getOutput()).split('\n')
            .filter(line => line.includes('Enter cache TTL in milliseconds')).at(-1);
        expect(prompt?.split('):')[1]?.trim()).toBe(expected);
    });
}

async function saveTtl(rendered: ReturnType<typeof renderEditor>): Promise<WidgetItem> {
    rendered.stdin.write('\r');
    await waitFor(() => {
        expect(rendered.onComplete).toHaveBeenCalledOnce();
    });
    const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
    if (!updated) {
        throw new Error('Expected the editor to return an updated widget');
    }
    return updated;
}

describe('CustomCommand TTL editor', () => {
    it.each([
        { typed: '500', expected: 500 },
        { typed: '0', expected: 0 },
        { typed: '60001', expected: 60000 }
    ])('saves $typed milliseconds as $expected', async ({ typed, expected }) => {
        const rendered = renderEditor(item);
        try {
            await waitForTtl(rendered, '');
            for (let length = 1; length <= typed.length; length++) {
                rendered.stdin.write(typed.charAt(length - 1));
                await waitForTtl(rendered, typed.slice(0, length));
            }
            const updated = await saveTtl(rendered);
            expect(updated).toEqual({ ...item, ttlMs: expected });
            expect(new CustomCommandWidget().getEditorDisplay(updated).modifierText).toContain(`ttl:${expected}ms`);
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('keeps an existing TTL when saved without edits', async () => {
        const savedItem = { ...item, ttlMs: 500 };
        const rendered = renderEditor(savedItem);
        try {
            await waitForTtl(rendered, '500');
            expect(await saveTtl(rendered)).toEqual(savedItem);
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('removes the TTL override when cleared, restoring the global setting', async () => {
        const rendered = renderEditor({ ...item, ttlMs: 500 });
        try {
            await waitForTtl(rendered, '500');
            for (const expected of ['50', '5', '']) {
                rendered.stdin.write('\u007F');
                await waitForTtl(rendered, expected);
            }
            expect(await saveTtl(rendered)).toEqual(item);
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('cancels without saving the edited TTL', async () => {
        const rendered = renderEditor({ ...item, ttlMs: 500 });
        try {
            await waitForTtl(rendered, '500');
            rendered.stdin.write('1');
            await waitForTtl(rendered, '5001');
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
