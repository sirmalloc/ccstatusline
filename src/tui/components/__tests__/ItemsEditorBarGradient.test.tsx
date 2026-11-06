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

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
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

// Polls until the condition holds; a fixed delay races Ink on a busy machine
async function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    do {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        if (condition()) {
            return true;
        }
    } while (Date.now() < deadline);
    return false;
}

const thermalBar: WidgetItem = { id: 'bar', type: 'context-bar', metadata: { gradient: 'thermal' } };

// The line editor's first frame for a single gradient bar at the given color level
async function drawEditor(colorLevel: Settings['colorLevel']): Promise<string> {
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdout = new MockTtyStream();
    const stderr = new MockTtyStream();
    const chunks: string[] = [];
    stdout.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    const instance = render(
        React.createElement(ItemsEditor, {
            widgets: [thermalBar],
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            lineNumber: 1,
            settings: { ...DEFAULT_SETTINGS, colorLevel }
        }),
        {
            stdin,
            stdout: stdout as unknown as NodeJS.WriteStream,
            stderr: stderr as unknown as NodeJS.WriteStream,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        }
    );

    try {
        const output = () => stripAnsi(chunks.join(''));
        await waitUntil(() => output().includes('Context Bar'));
        return output();
    } finally {
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
    }
}

describe('ItemsEditor bar gradients', () => {
    it('offers (g) and shows the preset at truecolor', async () => {
        const screen = await drawEditor(3);
        expect(screen).toContain('(g)radient');
        expect(screen).toContain('gradient: thermal');
        expect(screen).not.toContain('needs truecolor');
    });

    it('hides (g) below truecolor and explains the plain bar', async () => {
        for (const colorLevel of [1, 2] as const) {
            const screen = await drawEditor(colorLevel);
            expect(screen).not.toContain('(g)radient');
            expect(screen).toContain('gradient: thermal, needs truecolor');
        }
    });
});
