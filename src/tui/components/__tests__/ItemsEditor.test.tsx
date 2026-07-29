import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
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
import {
    applyColors,
    getPowerlineTheme
} from '../../../utils/colors';
import type { ThemeSlotContext } from '../../../utils/effective-theme-colors';
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

const THEMED_SETTINGS = {
    ...DEFAULT_SETTINGS,
    colorLevel: 3 as const,
    powerline: {
        ...DEFAULT_SETTINGS.powerline,
        enabled: true,
        theme: 'nord-aurora'
    }
};

async function renderItemsEditor(widgets: WidgetItem[], settings: Settings = DEFAULT_SETTINGS) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        React.createElement(ItemsEditor, {
            widgets,
            onUpdate: vi.fn(),
            onBack: vi.fn(),
            lineNumber: 1,
            themeSlotContext: allRendered(widgets),
            settings
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
        stdin,
        getOutput: () => stdout.getOutput(),
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

function nordLevel3() {
    const level = getPowerlineTheme('nord-aurora')?.['3'];
    if (!level) {
        throw new Error('nord-aurora has no truecolor level');
    }

    return level;
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

    it('tints a row with the colour the widget renders in', async () => {
        const { output, teardown } = await renderItemsEditor([
            { id: '1', type: 'model', color: 'hex:FF0000' }
        ], {
            ...DEFAULT_SETTINGS,
            colorLevel: 3
        });

        try {
            expect(output).toContain(applyColors('Model', 'hex:FF0000', undefined, undefined, 'truecolor', undefined));
        } finally {
            teardown();
        }
    });

    it('tints an unpinned row with the theme colour, matching the colour editor', async () => {
        const level = nordLevel3();
        const { output, teardown } = await renderItemsEditor([
            { id: '1', type: 'model', color: 'hex:FF0000' }
        ], THEMED_SETTINGS);

        try {
            expect(output).toContain(applyColors('Model', level.fg[0], level.bg[0], undefined, 'truecolor', undefined));
            expect(output).not.toContain(applyColors('Model', 'hex:FF0000', undefined, undefined, 'truecolor', undefined));
        } finally {
            teardown();
        }
    });

    it('leaves a preserve-colors custom command untinted', async () => {
        const { output, teardown } = await renderItemsEditor([
            {
                id: '1',
                type: 'custom-command',
                commandPath: 'echo hi',
                preserveColors: true,
                color: 'hex:FF0000'
            }
        ], {
            ...DEFAULT_SETTINGS,
            colorLevel: 3
        });

        try {
            expect(output).not.toContain(applyColors('Custom Command', 'hex:FF0000', undefined, undefined, 'truecolor', undefined));
        } finally {
            teardown();
        }
    });

    it('drops the tint in move mode so the dragged row stays visible', async () => {
        const level = nordLevel3();
        const { stdin, getOutput, teardown } = await renderItemsEditor([
            { id: '1', type: 'model' },
            { id: '2', type: 'git-branch' }
        ], THEMED_SETTINGS);

        try {
            const themedRow = applyColors('Model', level.fg[0], level.bg[0], undefined, 'truecolor', undefined);
            expect(getOutput()).toContain(themedRow);

            stdin.write('\r'); // Enter starts move mode
            await flushInk();

            const frame = getOutput().split('[MOVE MODE]').at(-1) ?? '';
            expect(getOutput()).toContain('[MOVE MODE]');
            expect(frame).not.toContain(themedRow);
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
