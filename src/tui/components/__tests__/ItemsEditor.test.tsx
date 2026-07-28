import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { ItemsEditor } from '../ItemsEditor';

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

async function renderItemsEditor(widgets: WidgetItem[]) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        React.createElement(ItemsEditor, {
            widgets,
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            lineNumber: 1,
            settings: DEFAULT_SETTINGS
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

    await flushInk();

    return {
        output: stdout.getOutput(),
        teardown: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

describe('ItemsEditor', () => {
    it('names the line and the editing mode in the title', async () => {
        const { output, teardown } = await renderItemsEditor([{ id: '1', type: 'model' }]);

        try {
            expect(output).toContain('Edit Line 1');
            expect(output).toContain('[WIDGETS]');
        } finally {
            teardown();
        }
    });

    it('numbers rows and keeps the structure markers', async () => {
        const { output, teardown } = await renderItemsEditor([
            {
                id: '1',
                type: 'model',
                merge: true
            },
            { id: '2', type: 'separator', character: '|' },
            { id: '3', type: 'git-branch' }
        ]);

        try {
            expect(output).toContain('1. Model');
            expect(output).toContain('(merged→)');
            expect(output).toContain('2. Separator |');
            expect(output).toContain('3. Git Branch');
        } finally {
            teardown();
        }
    });
});
