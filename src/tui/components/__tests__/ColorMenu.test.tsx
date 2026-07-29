import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi,
    type Mock
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    applyColors,
    getPowerlineTheme
} from '../../../utils/colors';
import { ColorMenu } from '../ColorMenu';

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
 * that changed the menu's mode is still handled by the previous render's closure. Sequences
 * that press a mode key and then act inside that mode have to let the effect flush first.
 */
async function settleInputHandler() {
    for (let i = 0; i < 10; i++) {
        await flushInk();
    }
}

const RULED_WIDGETS: WidgetItem[] = [
    {
        id: '1',
        type: 'model',
        rules: [
            { when: { widget: 'context-percentage', greaterThan: 80 }, apply: { color: 'red' } },
            { when: { widget: 'context-percentage', greaterThan: 90 }, apply: { bold: true } }
        ]
    },
    { id: '2', type: 'git-branch' }
];

async function renderColorMenu(
    widgets: WidgetItem[] = RULED_WIDGETS,
    extraProps: Record<string, unknown> = {}
) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const onUpdate = vi.fn();
    const onBack = vi.fn();
    const instance = render(
        React.createElement(ColorMenu, {
            widgets,
            lineIndex: 0,
            settings: DEFAULT_SETTINGS,
            onUpdate,
            onBack,
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
        teardown: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

describe('ColorMenu rules accordion', () => {
    it('badges a row with how many rules the widget carries', async () => {
        const { getOutput, teardown } = await renderColorMenu();

        try {
            expect(getOutput()).toContain('[2 rules]');
        } finally {
            teardown();
        }
    });

    it('expands the highlighted widget to show its rules', async () => {
        const { stdin, getOutput, teardown } = await renderColorMenu();

        try {
            expect(getOutput()).not.toContain('when context-percentage greater than 80');

            stdin.write('E');
            await settleInputHandler();

            expect(getOutput()).toContain('when context-percentage greater than 80');
        } finally {
            teardown();
        }
    });

    it('moves the rule selection with the arrows while expanded', async () => {
        const { stdin, getOutput, teardown } = await renderColorMenu();

        try {
            stdin.write('E');
            await settleInputHandler();

            stdin.write('\x1B[B');
            await settleInputHandler();

            expect(getOutput()).toContain('› when context-percentage greater than 90');
        } finally {
            teardown();
        }
    });

    it('collapses on escape instead of leaving the colour editor', async () => {
        const { stdin, onBack, teardown } = await renderColorMenu();

        try {
            stdin.write('E');
            await settleInputHandler();

            stdin.write('\x1B');
            await settleInputHandler();

            expect(onBack).not.toHaveBeenCalled();
        } finally {
            teardown();
        }
    });

    // Rules cannot be created here, so opening a widget with none would be a dead end.
    it('does not expand a widget that has no rules', async () => {
        const onAccordionChange = vi.fn();
        const { stdin, teardown } = await renderColorMenu(
            [{ id: '1', type: 'model' }],
            { onAccordionChange }
        );

        try {
            stdin.write('E');
            await settleInputHandler();

            expect(onAccordionChange).not.toHaveBeenCalled();
        } finally {
            teardown();
        }
    });

    it('aims colour cycling at the selected rule while expanded', async () => {
        const { stdin, onUpdate, teardown } = await renderColorMenu();

        try {
            stdin.write('E');
            await settleInputHandler();

            stdin.write('\x1B[C'); // right arrow cycles colour
            await settleInputHandler();

            const updated = onUpdate.mock.calls.at(-1)?.[0] as WidgetItem[] | undefined;
            expect(updated?.[0]?.color).toBeUndefined();
            expect(updated?.[0]?.rules?.[0]?.apply.color).toBeDefined();
            expect(updated?.[0]?.rules?.[0]?.apply.color).not.toBe('red');
        } finally {
            teardown();
        }
    });

    it('toggles bold on the selected rule while expanded', async () => {
        const { stdin, onUpdate, teardown } = await renderColorMenu();

        try {
            stdin.write('E');
            await settleInputHandler();

            stdin.write('b');
            await settleInputHandler();

            const updated = onUpdate.mock.calls.at(-1)?.[0] as WidgetItem[] | undefined;
            expect(updated?.[0]?.bold).toBeUndefined();
            expect(updated?.[0]?.rules?.[0]?.apply.bold).toBe(true);
        } finally {
            teardown();
        }
    });

    // Under a theme the theme owns the channel, so a rule colour would be invisible until the
    // channel is pinned. Rule edits sit behind the same gate as the widget's own colour.
    it('ignores rule colour edits until the channel is pinned under a theme', async () => {
        const themed = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'nord-aurora'
            }
        };
        const { stdin, onUpdate, teardown } = await renderColorMenu(RULED_WIDGETS, { settings: themed });

        try {
            stdin.write('E');
            await settleInputHandler();

            stdin.write('\x1B[C');
            await settleInputHandler();

            expect(onUpdate).not.toHaveBeenCalled();
        } finally {
            teardown();
        }
    });

    it('edits the rule colour once the channel is pinned', async () => {
        const themed = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'nord-aurora'
            }
        };
        const pinned: WidgetItem[] = [{
            ...RULED_WIDGETS[0],
            id: '1',
            type: 'model',
            pinColor: true
        }];
        const { stdin, onUpdate, teardown } = await renderColorMenu(pinned, { settings: themed });

        try {
            stdin.write('E');
            await settleInputHandler();

            stdin.write('\x1B[C');
            await settleInputHandler();

            const updated = onUpdate.mock.calls.at(-1)?.[0] as WidgetItem[] | undefined;
            expect(updated?.[0]?.rules?.[0]?.apply.color).toBeDefined();
        } finally {
            teardown();
        }
    });

    it('carries the accordion in from the widget editor', async () => {
        const { getOutput, teardown } = await renderColorMenu(
            RULED_WIDGETS,
            { accordionState: { expandedWidgetId: '1', selectedRuleIndex: 1 } }
        );

        try {
            expect(getOutput()).toContain('› when context-percentage greater than 90');
        } finally {
            teardown();
        }
    });
});

describe('ColorMenu', () => {
    it('keeps bold and dim indicators on the current-style row', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const widgets: WidgetItem[] = [
            { id: '1', type: 'cache-hit-rate' },
            {
                id: '2',
                type: 'cache-read',
                color: 'hex:ABB2BF',
                backgroundColor: 'bgBrightBlack',
                bold: true,
                dim: 'parens'
            },
            { id: '3', type: 'cache-write' },
            { id: '4', type: 'tokens-cached' }
        ];

        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                lineIndex: 0,
                settings: {
                    ...DEFAULT_SETTINGS,
                    colorLevel: 3,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true
                    }
                },
                onUpdate: vi.fn(),
                onBack: vi.fn()
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

        try {
            await flushInk();
            stdin.write('\x1B[B');
            await flushInk();

            const latestFrame = stdout.getOutput().split('Edit Line 1').at(-1) ?? '';
            const currentStyleLine = latestFrame
                .split('\n')
                .find(line => line.includes('Current (')) ?? '';

            expect(currentStyleLine).toContain('[BOLD] [DIM ()]');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    async function renderThemedColorMenu(
        onUpdate: Mock<(widgets: WidgetItem[]) => void>,
        themeActive: boolean,
        widgets: WidgetItem[] = [{ id: '1', type: 'model' }]
    ) {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                lineIndex: 0,
                settings: {
                    ...DEFAULT_SETTINGS,
                    colorLevel: 3,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        theme: themeActive ? 'nord-aurora' : 'custom'
                    }
                },
                onUpdate,
                onBack: vi.fn()
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
            instance,
            stdin,
            stdout,
            stderr
        };
    }

    function lastUpdated(onUpdate: Mock<(widgets: WidgetItem[]) => void>): WidgetItem[] | undefined {
        return onUpdate.mock.calls.at(-1)?.[0];
    }

    it('ignores colour cycling until the channel is pinned under a theme', async () => {
        const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();
        const { instance, stdin, stdout, stderr } = await renderThemedColorMenu(onUpdate, true, [
            { id: '1', type: 'model', color: 'hex:FF0000' }
        ]);
        try {
            stdin.write('\x1B[C'); // right arrow would cycle the foreground colour
            await flushInk();

            // the dormant colour must survive a stray arrow key
            expect(onUpdate).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('cycles the colour once the channel is pinned', async () => {
        const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();
        const { instance, stdin, stdout, stderr } = await renderThemedColorMenu(onUpdate, true, [
            {
                id: '1',
                type: 'model',
                color: 'hex:FF0000',
                pinColor: true
            }
        ]);
        try {
            stdin.write('\x1B[C');
            await flushInk();

            const updated = lastUpdated(onUpdate)?.find(widget => widget.id === '1');
            expect(updated?.pinColor).toBe(true);
            expect(updated?.color).not.toBe('hex:FF0000');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('seeds a pin with the theme colour the widget was showing', async () => {
        const themeFg = nordLevel3().fg[0];
        const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();
        const { instance, stdin, stdout, stderr } = await renderThemedColorMenu(onUpdate, true);
        try {
            stdin.write('p');
            await flushInk();

            const updated = lastUpdated(onUpdate)?.find(widget => widget.id === '1');
            expect(updated?.pinColor).toBe(true);
            expect(updated?.color).toBe(themeFg);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('pins the highlighted widget when (p) is pressed under a theme', async () => {
        const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();
        const { instance, stdin, stdout, stderr } = await renderThemedColorMenu(onUpdate, true);
        try {
            stdin.write('p');
            await flushInk();

            expect(onUpdate).toHaveBeenCalled();
            expect(lastUpdated(onUpdate)?.find(widget => widget.id === '1')?.pinColor).toBe(true);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('does not pin a colour edit when no theme is active', async () => {
        const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();
        const { instance, stdin, stdout, stderr } = await renderThemedColorMenu(onUpdate, false);
        try {
            stdin.write('\x1B[C');
            await flushInk();

            expect(lastUpdated(onUpdate)?.find(widget => widget.id === '1')?.pinColor).toBeUndefined();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    async function renderCurrentStyleLine(widgets: WidgetItem[]): Promise<{ line: string; teardown: () => void }> {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                lineIndex: 0,
                settings: {
                    ...DEFAULT_SETTINGS,
                    colorLevel: 3,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        theme: 'nord-aurora'
                    }
                },
                onUpdate: vi.fn(),
                onBack: vi.fn()
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
        const frame = stdout.getOutput().split('Edit Line 1').at(-1) ?? '';
        const line = frame.split('\n').find(entry => entry.includes('Current (')) ?? '';
        return {
            line,
            teardown: () => {
                instance.unmount();
                instance.cleanup();
                stdin.destroy();
                stdout.destroy();
                stderr.destroy();
            }
        };
    }

    it('tells the user how to take over an unpinned channel', async () => {
        const { line, teardown } = await renderCurrentStyleLine([
            { id: '1', type: 'model' }
        ]);
        try {
            expect(stripAnsi(line)).toContain('press (p) to override');
        } finally {
            teardown();
        }
    });

    it('drops the override hint once the channel is pinned', async () => {
        const { line, teardown } = await renderCurrentStyleLine([
            {
                id: '1',
                type: 'model',
                color: 'hex:FF0000',
                pinColor: true
            }
        ]);
        try {
            expect(stripAnsi(line)).not.toContain('press (p) to override');
        } finally {
            teardown();
        }
    });

    it('keeps pin state off the current-style row', async () => {
        const { line, teardown } = await renderCurrentStyleLine([
            { id: '1', type: 'model', color: 'hex:FF0000', pinColor: true }
        ]);
        try {
            expect(line).not.toContain('PINNED');
            expect(line).not.toContain('unpinned');
        } finally {
            teardown();
        }
    });

    async function renderPlainOutput(widgets: WidgetItem[]): Promise<{ output: string; teardown: () => void }> {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                lineIndex: 0,
                settings: {
                    ...DEFAULT_SETTINGS,
                    colorLevel: 3,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true
                    }
                },
                onUpdate: vi.fn(),
                onBack: vi.fn()
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
            output: stripAnsi(stdout.getOutput()),
            teardown: () => {
                instance.unmount();
                instance.cleanup();
                stdin.destroy();
                stdout.destroy();
                stderr.destroy();
            }
        };
    }

    it('names the line and the editing mode in the title', async () => {
        const { output, teardown } = await renderPlainOutput([{ id: '1', type: 'model' }]);

        try {
            expect(output).toContain('Edit Line 1');
            expect(output).toContain('[COLORS]');
        } finally {
            teardown();
        }
    });

    it('numbers rows by their position in the line, leaving gaps for skipped widgets', async () => {
        const { output, teardown } = await renderPlainOutput([
            { id: '1', type: 'model' },
            { id: '2', type: 'separator', character: '|' },
            { id: '3', type: 'git-branch' }
        ]);

        try {
            expect(output).toContain('1. Model');
            expect(output).toContain('3. Git Branch');
            expect(output).not.toContain('2. Separator');
        } finally {
            teardown();
        }
    });

    it('keeps the widget editor structure markers on colour rows', async () => {
        const { output, teardown } = await renderPlainOutput([
            {
                id: '1',
                type: 'model',
                merge: true
            },
            { id: '2', type: 'git-branch' }
        ]);

        try {
            expect(output).toContain('(merged→)');
        } finally {
            teardown();
        }
    });

    function nordLevel3() {
        const level = getPowerlineTheme('nord-aurora')?.['3'];
        if (!level) {
            throw new Error('nord-aurora has no truecolor level');
        }

        return level;
    }

    it('shows the theme colour on the current-style row when the channel is unpinned', async () => {
        const themeFg = nordLevel3().fg[0] ?? '';
        const { line, teardown } = await renderCurrentStyleLine([
            { id: '1', type: 'model', color: 'hex:FF0000' }
        ]);

        try {
            const plain = stripAnsi(line);
            expect(plain).toContain('(theme)');
            expect(plain).toContain(`#${themeFg.replace('hex:', '')}`);
            expect(plain).not.toContain('#FF0000');
        } finally {
            teardown();
        }
    });

    it('keeps showing the widget colour on the current-style row when pinned', async () => {
        const { line, teardown } = await renderCurrentStyleLine([
            {
                id: '1',
                type: 'model',
                color: 'hex:FF0000',
                pinColor: true
            }
        ]);

        try {
            const plain = stripAnsi(line);
            expect(plain).toContain('#FF0000');
            expect(plain).not.toContain('(theme)');
        } finally {
            teardown();
        }
    });

    it('tints an unpinned row with the theme colour, not its dormant colour', async () => {
        const level = nordLevel3();
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(ColorMenu, {
                widgets: [{
                    id: '1',
                    type: 'model',
                    color: 'hex:FF0000',
                    backgroundColor: 'hex:00FF00'
                }],
                lineIndex: 0,
                settings: {
                    ...DEFAULT_SETTINGS,
                    colorLevel: 3,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        theme: 'nord-aurora'
                    }
                },
                onUpdate: vi.fn(),
                onBack: vi.fn()
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

        try {
            await flushInk();
            const output = stdout.getOutput();
            const themed = applyColors('Model', level.fg[0], level.bg[0], undefined, 'truecolor', undefined);
            const dormant = applyColors('Model', 'hex:FF0000', 'hex:00FF00', undefined, 'truecolor', undefined);

            expect(output).toContain(themed);
            expect(output).not.toContain(dormant);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('has no back row, matching the widget editor list', async () => {
        const { output, teardown } = await renderPlainOutput([{ id: '1', type: 'model' }]);

        try {
            expect(output).not.toContain('← Back');
        } finally {
            teardown();
        }
    });
});
