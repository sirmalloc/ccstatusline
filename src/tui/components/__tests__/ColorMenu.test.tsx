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
import type { ThemeSlotContext } from '../../../utils/effective-theme-colors';
import { ColorMenu } from '../ColorMenu';

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
                themeSlotContext: allRendered(widgets),
                editingBackground: false,
                onEditingBackgroundChange: vi.fn(),
                showSeparators: false,
                onShowSeparatorsChange: vi.fn(),
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
                themeSlotContext: allRendered(widgets),
                editingBackground: false,
                onEditingBackgroundChange: vi.fn(),
                showSeparators: false,
                onShowSeparatorsChange: vi.fn(),
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

    it('keeps a preserve-colors custom command out of the colour list entirely', async () => {
        const onBack = vi.fn();
        const widgets: WidgetItem[] = [{
            id: '1',
            type: 'custom-command',
            preserveColors: true
        }];
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                lineIndex: 0,
                themeSlotContext: allRendered(widgets),
                editingBackground: false,
                onEditingBackgroundChange: vi.fn(),
                showSeparators: false,
                onShowSeparatorsChange: vi.fn(),
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
                onBack
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
        try {
            // supportsColors is false while preserveColors is set, so there is no row to
            // guard - which is why the theme-ownership gate never sees such a widget.
            expect(stripAnsi(stdout.getOutput())).toContain('No colorable widgets');
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

            // Without this the assertion below passes when nothing happened at all, which
            // is exactly how colour editing could break for every non-themed user unnoticed.
            expect(onUpdate).toHaveBeenCalled();
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
                themeSlotContext: allRendered(widgets),
                editingBackground: false,
                onEditingBackgroundChange: vi.fn(),
                showSeparators: false,
                onShowSeparatorsChange: vi.fn(),
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
                themeSlotContext: allRendered(widgets),
                editingBackground: false,
                onEditingBackgroundChange: vi.fn(),
                showSeparators: false,
                onShowSeparatorsChange: vi.fn(),
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
        const widgets: WidgetItem[] = [{
            id: '1',
            type: 'model',
            color: 'hex:FF0000',
            backgroundColor: 'hex:00FF00'
        }];
        const instance = render(
            React.createElement(ColorMenu, {
                widgets,
                lineIndex: 0,
                themeSlotContext: allRendered(widgets),
                editingBackground: false,
                onEditingBackgroundChange: vi.fn(),
                showSeparators: false,
                onShowSeparatorsChange: vi.fn(),
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

    /** Render with whatever props the test cares about; the rest get workable defaults. */
    async function renderWith(overrides: Partial<React.ComponentProps<typeof ColorMenu>> & { widgets: WidgetItem[] }) {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(ColorMenu, {
                lineIndex: 0,
                themeSlotContext: allRendered(overrides.widgets),
                editingBackground: false,
                onEditingBackgroundChange: vi.fn(),
                showSeparators: false,
                onShowSeparatorsChange: vi.fn(),
                settings: { ...DEFAULT_SETTINGS, colorLevel: 3 },
                onUpdate: vi.fn(),
                onBack: vi.fn(),
                ...overrides
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
            output: () => stdout.getOutput(),
            teardown: () => {
                instance.unmount();
                instance.cleanup();
                stdin.destroy();
                stdout.destroy();
                stderr.destroy();
            }
        };
    }

    describe('highlight reporting', () => {
        const WIDGETS: WidgetItem[] = [
            { id: 'flex', type: 'flex-separator' },
            { id: 'model', type: 'model' }
        ];

        it('does not report a highlight it had to guess', async () => {
            const onWidgetHighlight = vi.fn();
            const { teardown } = await renderWith({
                widgets: WIDGETS,
                initialWidgetId: 'flex',
                onWidgetHighlight
            });

            try {
                // 'flex' has no colourable row, so this screen falls back to its first one. Reporting
                // that guess overwrites the caller's cursor, and swapping back lands on row 1 - so a
                // Tab round trip silently moves the widget editor's selection off the flex separator.
                expect(onWidgetHighlight).not.toHaveBeenCalled();
            } finally {
                teardown();
            }
        });

        it('reports the highlight once the user moves it', async () => {
            const onWidgetHighlight = vi.fn();
            const { stdin, teardown } = await renderWith({
                widgets: [...WIDGETS, { id: 'version', type: 'version' }],
                initialWidgetId: 'flex',
                onWidgetHighlight
            });

            try {
                stdin.write('\x1B[B'); // down arrow
                await flushInk();

                expect(onWidgetHighlight).toHaveBeenCalledWith('version');
            } finally {
                teardown();
            }
        });

        it('does not report an empty list as a highlight change', async () => {
            const onWidgetHighlight = vi.fn();
            const { teardown } = await renderWith({
                widgets: [{ id: 'flex', type: 'flex-separator' }],
                initialWidgetId: 'flex',
                onWidgetHighlight
            });

            try {
                // With nothing colourable the guess is null, which must still count as a guess:
                // reporting it clears the caller's cursor and sends the widget editor to row 1,
                // which is the round trip this screen is supposed to preserve.
                expect(onWidgetHighlight).not.toHaveBeenCalled();
            } finally {
                teardown();
            }
        });

        it('reports a highlight the caller asked for', async () => {
            const onWidgetHighlight = vi.fn();
            const { teardown } = await renderWith({
                widgets: WIDGETS,
                initialWidgetId: 'model',
                onWidgetHighlight
            });

            try {
                expect(onWidgetHighlight).toHaveBeenCalledWith('model');
            } finally {
                teardown();
            }
        });
    });

    describe('Tab while another mode owns the keyboard', () => {
        it('does not swap editors from hex input mode', async () => {
            const onTabSwap = vi.fn();
            const { stdin, teardown } = await renderWith({
                widgets: [{ id: '1', type: 'model' }],
                onTabSwap
            });

            try {
                stdin.write('h'); // open hex entry
                await flushInk();
                stdin.write('\t');
                await flushInk();

                // Swapping here discards a half-typed colour with no prompt.
                expect(onTabSwap).not.toHaveBeenCalled();
            } finally {
                teardown();
            }
        });

        it('does not swap editors from the clear-all confirmation', async () => {
            const onTabSwap = vi.fn();
            const { stdin, teardown } = await renderWith({
                widgets: [{ id: '1', type: 'model' }],
                onTabSwap
            });

            try {
                stdin.write('c'); // open the clear-all confirmation
                await flushInk();
                stdin.write('\t');
                await flushInk();

                expect(onTabSwap).not.toHaveBeenCalled();
            } finally {
                teardown();
            }
        });

        it('still swaps editors from the normal list', async () => {
            const onTabSwap = vi.fn();
            const { stdin, teardown } = await renderWith({
                widgets: [{ id: '1', type: 'model' }],
                onTabSwap
            });

            try {
                stdin.write('\t');
                await flushInk();

                expect(onTabSwap).toHaveBeenCalled();
            } finally {
                teardown();
            }
        });

        it('still swaps editors when nothing on the line is colourable', async () => {
            const onTabSwap = vi.fn();
            const onBack = vi.fn();
            const { stdin, teardown } = await renderWith({
                widgets: [{ id: '1', type: 'flex-separator' }],
                onTabSwap,
                onBack
            });

            try {
                stdin.write('\t');
                await flushInk();

                // The widget editor is where you go to add something, and this screen says so.
                expect(onTabSwap).toHaveBeenCalled();
                expect(onBack).not.toHaveBeenCalled();
            } finally {
                teardown();
            }
        });
    });

    describe('separator rows', () => {
        const WIDGETS: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator', character: '|' }
        ];

        it('lists separators when they are what renders', async () => {
            const { output, teardown } = await renderWith({
                widgets: WIDGETS,
                showSeparators: true
            });

            try {
                expect(stripAnsi(output())).toContain('Separator |');
            } finally {
                teardown();
            }
        });

        const WITH_DEFAULT_SEPARATOR = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3 as const,
            defaultSeparator: '~'
        };

        it('keeps listing separators when a default separator is set, because they still render', async () => {
            const { output, teardown } = await renderWith({
                widgets: WIDGETS,
                showSeparators: true,
                settings: WITH_DEFAULT_SEPARATOR
            });

            try {
                // A default separator is not a replacement for separator widgets already on the
                // line - the renderer still draws them, colouring with widget.color ?? 'gray'.
                // Hiding the rows would leave rendered output that cannot be selected or recoloured.
                expect(stripAnsi(output())).toContain('Separator |');
            } finally {
                teardown();
            }
        });

        it('lets the toggle hide separators a default separator did not remove', async () => {
            const onShowSeparatorsChange = vi.fn();
            const { stdin, teardown } = await renderWith({
                widgets: WIDGETS,
                showSeparators: true,
                onShowSeparatorsChange,
                settings: WITH_DEFAULT_SEPARATOR
            });

            try {
                stdin.write('s');
                await flushInk();

                // Whatever the list shows, the toggle governs it - otherwise rows are stranded.
                expect(onShowSeparatorsChange).toHaveBeenCalledWith(false);
            } finally {
                teardown();
            }
        });

        it('hides separators under powerline, which draws its own', async () => {
            const { output, teardown } = await renderWith({
                widgets: WIDGETS,
                showSeparators: true,
                settings: {
                    ...DEFAULT_SETTINGS,
                    colorLevel: 3,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true
                    }
                }
            });

            try {
                expect(stripAnsi(output())).not.toContain('Separator |');
            } finally {
                teardown();
            }
        });
    });
});
