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
                .find(line => line.includes('Current foreground')) ?? '';

            expect(currentStyleLine).toContain('[BOLD] [DIM ()]');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    async function renderThemedColorMenu(onUpdate: Mock<(widgets: WidgetItem[]) => void>, themeActive: boolean) {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const widgets: WidgetItem[] = [{ id: '1', type: 'model' }];
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

    it('auto-pins a widget colour when cycled under an active theme', async () => {
        const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();
        const { instance, stdin, stdout, stderr } = await renderThemedColorMenu(onUpdate, true);
        try {
            stdin.write('\x1B[C'); // right arrow cycles the foreground colour
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
        const line = frame.split('\n').find(entry => entry.includes('Current foreground')) ?? '';
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

    it('marks the current channel [PINNED] when it is pinned under a theme', async () => {
        const { line, teardown } = await renderCurrentStyleLine([
            { id: '1', type: 'model', color: 'hex:FF0000', pinColor: true }
        ]);
        try {
            expect(line).toContain('[PINNED]');
        } finally {
            teardown();
        }
    });

    it('flags a dormant colour as unpinned under a theme', async () => {
        const { line, teardown } = await renderCurrentStyleLine([
            { id: '1', type: 'model', color: 'hex:FF0000' }
        ]);
        try {
            expect(line).toContain('unpinned');
            expect(line).not.toContain('[PINNED]');
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
