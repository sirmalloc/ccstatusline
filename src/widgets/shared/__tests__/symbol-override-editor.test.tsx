import { render } from 'ink';
import { PassThrough } from 'node:stream';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    renderSymbolSlotsEditor,
    type SymbolSlot
} from '../symbol-override';

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

const gitStatusSlots: SymbolSlot[] = [
    { id: 'symbolConflicts', label: 'Conflicts', defaultSymbol: '!' },
    { id: 'symbolStaged', label: 'Staged', defaultSymbol: '+' },
    { id: 'symbolUnstaged', label: 'Unstaged', defaultSymbol: '*' },
    { id: 'symbolUntracked', label: 'Untracked', defaultSymbol: '?' }
];

function renderEditor(widget: WidgetItem, slots: SymbolSlot[] = gitStatusSlots, onComplete = vi.fn(), onCancel = vi.fn()) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        renderSymbolSlotsEditor({
            widget,
            onComplete,
            onCancel,
            action: 'edit-symbol-override'
        }, slots),
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

describe('SymbolSlotsEditor', () => {
    it('right-aligns labels so glyph values start in the same column', async () => {
        const rendered = renderEditor({ id: 'git-status', type: 'git-status' });

        try {
            await flushInk();

            const lines = getPlainOutput(rendered.stdout.getOutput())
                .split('\n')
                .filter(line => gitStatusSlots.some(slot => line.includes(`${slot.label}:`)));
            const colonColumns = lines.map(line => line.indexOf(':'));

            expect(lines).toHaveLength(gitStatusSlots.length);
            expect(new Set(colonColumns)).toHaveLength(1);
        } finally {
            cleanupEditor(rendered);
        }
    });

    it('resets the selected slot to default on Tab', async () => {
        const rendered = renderEditor({
            id: 'git-status',
            type: 'git-status',
            metadata: { symbolConflicts: 'x' }
        });

        try {
            await flushInk();
            rendered.stdin.write('\t');
            await flushInk();
            rendered.stdin.write('\r');
            await flushInk();

            const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
            expect(updated?.metadata).toBeUndefined();
        } finally {
            cleanupEditor(rendered);
        }
    });
});
