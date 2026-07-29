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

/**
 * Ink re-registers its input handler from a passive effect, so a key sent right after a key
 * that changed the editor's mode is still handled by the previous render's closure. Sequences
 * that press a mode key and then act inside that mode have to let the effect flush first.
 */
async function settleInputHandler() {
    for (let i = 0; i < 10; i++) {
        await flushInk();
    }
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

async function renderItemsEditor(
    widgets: WidgetItem[],
    settings: Settings = DEFAULT_SETTINGS,
    extraProps: Record<string, unknown> = {}
) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const onUpdate = vi.fn();
    const onBack = vi.fn();
    const instance = render(
        React.createElement(ItemsEditor, {
            widgets,
            onUpdate,
            onBack,
            lineNumber: 1,
            settings,
            ...extraProps
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
        onUpdate,
        onBack,
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

    it('badges a row with how many rules the widget carries', async () => {
        const { output, teardown } = await renderItemsEditor([
            {
                id: '1',
                type: 'model',
                rules: [
                    { when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } },
                    { when: { widget: 'context-percentage', greaterThan: 90 }, apply: { bold: true } }
                ]
            },
            { id: '2', type: 'git-branch' }
        ]);

        try {
            expect(output).toContain('[2 rules]');
        } finally {
            teardown();
        }
    });

    it('expands the selected widget to show its rules', async () => {
        const { stdin, getOutput, teardown } = await renderItemsEditor([
            {
                id: '1',
                type: 'model',
                rules: [{ when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } }]
            }
        ]);

        try {
            expect(getOutput()).not.toContain('when context-percentage greater than 80');

            stdin.write('+');
            await flushInk();

            expect(getOutput()).toContain('when context-percentage greater than 80');
        } finally {
            teardown();
        }
    });

    it('says so when an expanded widget has no rules yet', async () => {
        const { stdin, getOutput, teardown } = await renderItemsEditor([{ id: '1', type: 'model' }]);

        try {
            stdin.write('+');
            await flushInk();

            expect(getOutput()).toContain('No rules');
        } finally {
            teardown();
        }
    });

    it('moves the rule selection with the arrows while expanded', async () => {
        const { stdin, getOutput, teardown } = await renderItemsEditor([
            {
                id: '1',
                type: 'model',
                rules: [
                    { when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } },
                    { when: { widget: 'context-percentage', greaterThan: 90 }, apply: { bold: true } }
                ]
            }
        ]);

        try {
            stdin.write('+');
            await settleInputHandler();
            stdin.write('[B'); // down arrow
            await flushInk();

            expect(getOutput()).toContain('› when context-percentage greater than 90');
        } finally {
            teardown();
        }
    });

    it('collapses on escape instead of leaving the editor', async () => {
        const { stdin, getOutput, onBack, teardown } = await renderItemsEditor([
            {
                id: '1',
                type: 'model',
                rules: [{ when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } }]
            }
        ]);

        try {
            stdin.write('+');
            await settleInputHandler();

            stdin.write('\x1B'); // escape
            await settleInputHandler();

            expect(onBack).not.toHaveBeenCalled();
            expect(getOutput().split('1. Model').at(-1)).not.toContain('when context-percentage greater than 80');
        } finally {
            teardown();
        }
    });

    it('adds a rule to the selected widget from the accordion', async () => {
        const { stdin, onUpdate, teardown } = await renderItemsEditor([{ id: '1', type: 'model' }]);

        try {
            stdin.write('+');
            await settleInputHandler();

            stdin.write('a');
            await settleInputHandler();

            const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
            expect(updated?.[0]?.rules).toEqual([{ when: {}, apply: {} }]);
        } finally {
            teardown();
        }
    });

    it('opens the condition editor for the selected rule', async () => {
        const { stdin, getOutput, teardown } = await renderItemsEditor([
            {
                id: '1',
                type: 'model',
                rules: [{ when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } }]
            }
        ]);

        try {
            stdin.write('+');
            await settleInputHandler();

            stdin.write('e');
            await settleInputHandler();

            expect(getOutput()).toContain('Edit Condition');
        } finally {
            teardown();
        }
    });

    it('opens already expanded when handed accordion state', async () => {
        const { output, teardown } = await renderItemsEditor(
            [
                {
                    id: '1',
                    type: 'model',
                    rules: [
                        { when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } },
                        { when: { widget: 'context-percentage', greaterThan: 90 }, apply: { bold: true } }
                    ]
                }
            ],
            DEFAULT_SETTINGS,
            { accordionState: { expandedWidgetId: '1', selectedRuleIndex: 1 } }
        );

        try {
            expect(output).toContain('› when context-percentage greater than 90');
        } finally {
            teardown();
        }
    });

    it('reports accordion changes so the other editor mode can pick them up', async () => {
        const onAccordionChange = vi.fn();
        const { stdin, teardown } = await renderItemsEditor(
            [{
                id: '1',
                type: 'model',
                rules: [{ when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } }]
            }],
            DEFAULT_SETTINGS,
            { onAccordionChange }
        );

        try {
            stdin.write('+');
            await settleInputHandler();

            expect(onAccordionChange).toHaveBeenCalledWith({ expandedWidgetId: '1', selectedRuleIndex: 0 });
        } finally {
            teardown();
        }
    });

    it('advertises the rules key, and the rule keys once expanded', async () => {
        const { stdin, getOutput, teardown } = await renderItemsEditor(
            [{ id: '1', type: 'model' }],
            DEFAULT_SETTINGS,
            { onTabSwap: vi.fn() }
        );

        try {
            expect(getOutput()).toContain('(+) rules');

            stdin.write('+');
            await settleInputHandler();

            expect(getOutput()).toContain('ESC collapse');
            expect(getOutput()).toContain('⇥ edit colors');
        } finally {
            teardown();
        }
    });
});
