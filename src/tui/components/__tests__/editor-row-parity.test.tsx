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

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { ColorMenu } from '../ColorMenu';
import { ItemsEditor } from '../ItemsEditor';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 110;
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

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

const THEMED_SETTINGS = {
    ...DEFAULT_SETTINGS,
    colorLevel: 3 as const,
    powerline: {
        ...DEFAULT_SETTINGS.powerline,
        enabled: true,
        theme: 'nord-aurora'
    }
};

/** Widgets that appear in both modes, so the two lists are directly comparable. */
const WIDGETS: WidgetItem[] = [
    {
        id: '1',
        type: 'model',
        color: 'hex:FF0000',
        pinColor: true
    },
    {
        id: '2',
        type: 'git-branch',
        merge: true
    },
    { id: '3', type: 'context-percentage' }
];

async function renderRows(element: React.ReactElement): Promise<string[]> {
    const chunks: string[] = [];
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdoutStream = new MockTtyStream();
    stdoutStream.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()));
    const instance = render(element, {
        stdin,
        stdout: stdoutStream as unknown as NodeJS.WriteStream,
        stderr: new MockTtyStream() as unknown as NodeJS.WriteStream,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false
    });

    try {
        await flushInk();

        // debug mode writes a whole frame per render; take the last complete one
        const frame = chunks.filter(chunk => chunk.includes('Edit Line 1')).at(-1) ?? '';

        return frame
            .split('\n')
            .filter(line => /^\s*(▶\s+)?\d+\.\s/.test(stripAnsi(line)));
    } finally {
        instance.unmount();
        instance.cleanup();
    }
}

describe('editor row parity', () => {
    it('renders byte-identical rows in both editor modes', async () => {
        const itemRows = await renderRows(React.createElement(ItemsEditor, {
            widgets: WIDGETS,
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            lineNumber: 1,
            settings: THEMED_SETTINGS,
            onTabSwap: vi.fn()
        }));
        const colorRows = await renderRows(React.createElement(ColorMenu, {
            widgets: WIDGETS,
            lineIndex: 0,
            settings: THEMED_SETTINGS,
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            onTabSwap: vi.fn()
        }));

        expect(itemRows).toHaveLength(WIDGETS.length);
        expect(colorRows).toEqual(itemRows);
    });
});
