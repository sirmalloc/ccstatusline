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
import type { ThemeSlotContext } from '../../../utils/effective-theme-colors';
import { ColorMenu } from '../ColorMenu';
import { ItemsEditor } from '../ItemsEditor';

/** Slot context for a line where every widget produces output. */
function allRendered(widgets: WidgetItem[]): ThemeSlotContext {
    return {
        contents: widgets.map(() => 'x'),
        startIndex: 0
    };
}

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
            themeSlotContext: allRendered(WIDGETS),
            onTabSwap: vi.fn()
        }));
        const colorRows = await renderRows(React.createElement(ColorMenu, {
            widgets: WIDGETS,
            lineIndex: 0,
            settings: THEMED_SETTINGS,
            themeSlotContext: allRendered(WIDGETS),
            editingBackground: false,
            onEditingBackgroundChange: vi.fn(),
            showSeparators: false,
            onShowSeparatorsChange: vi.fn(),
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            onTabSwap: vi.fn()
        }));

        expect(itemRows).toHaveLength(WIDGETS.length);
        expect(colorRows).toEqual(itemRows);
    });

    // The fixture above is all-colourable, so it cannot catch the case where the lists
    // legitimately differ. This one covers it: the colour mode drops rows it cannot colour,
    // and the rows it keeps must still carry their original numbers.
    it('keeps widget numbering aligned when the colour mode drops rows', async () => {
        const mixedWidgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'flex-separator' },
            {
                id: '3',
                type: 'separator',
                character: '|'
            },
            {
                id: '4',
                type: 'custom-command',
                preserveColors: true
            },
            { id: '5', type: 'git-branch' }
        ];

        const itemRows = await renderRows(React.createElement(ItemsEditor, {
            widgets: mixedWidgets,
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            lineNumber: 1,
            settings: THEMED_SETTINGS,
            themeSlotContext: allRendered(mixedWidgets),
            onTabSwap: vi.fn()
        }));
        const colorRows = await renderRows(React.createElement(ColorMenu, {
            widgets: mixedWidgets,
            lineIndex: 0,
            settings: THEMED_SETTINGS,
            themeSlotContext: allRendered(mixedWidgets),
            editingBackground: false,
            onEditingBackgroundChange: vi.fn(),
            showSeparators: false,
            onShowSeparatorsChange: vi.fn(),
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            onTabSwap: vi.fn()
        }));

        const rowNumber = (row: string) => stripAnsi(row).trim().replace(/^▶\s+/, '').split('.')[0];

        // The widget editor lists everything
        expect(itemRows.map(rowNumber)).toEqual(['1', '2', '3', '4', '5']);
        // The colour editor drops the flex separator, the separator and the preserve-colors
        // command, and leaves gaps rather than renumbering
        expect(colorRows.map(rowNumber)).toEqual(['1', '5']);
    });
});
