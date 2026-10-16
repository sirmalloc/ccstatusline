import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { getVisibleWidth } from '../../../utils/ansi';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../../../utils/renderer';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import {
    TERMINAL_WIDTH_OPTIONS,
    TerminalWidthMenu,
    buildTerminalWidthItems,
    getTerminalWidthSelectionIndex,
    validateCompactThresholdInput
} from '../TerminalWidthMenu';

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

interface CapturedWriteStream extends NodeJS.WriteStream {
    clearOutput: () => void;
    getOutput: () => string;
}

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
        clearOutput() {
            chunks.length = 0;
        },
        getOutput() {
            return chunks.join('');
        }
    });
}

describe('TerminalWidthMenu helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('validates compact threshold input', () => {
        expect(validateCompactThresholdInput('')).toBe('Please enter a valid number');
        expect(validateCompactThresholdInput('0')).toBe('Value must be between 1 and 99 (you entered 0)');
        expect(validateCompactThresholdInput('100')).toBe('Value must be between 1 and 99 (you entered 100)');
        expect(validateCompactThresholdInput('42')).toBeNull();
    });

    it('builds terminal width menu items with active and threshold sublabels', () => {
        const items = buildTerminalWidthItems('full-until-compact', 60);

        expect(items).toHaveLength(3);
        expect(items[0]).toMatchObject({
            label: 'Full width always',
            sublabel: '(default)',
            value: 'full'
        });
        expect(items[1]).toMatchObject({
            label: 'Full width minus 40',
            value: 'full-minus-40'
        });
        expect(items[1]?.sublabel).toBeUndefined();
        expect(items[2]).toMatchObject({
            label: 'Full width until compact',
            sublabel: '(threshold 60%, active)',
            value: 'full-until-compact'
        });
        expect(items[2]?.description).toContain('60%');
    });

    it('gives the number of columns the renderer reserves in Full width always', () => {
        const widgets: WidgetItem[] = [{ id: 'text', type: 'custom-text', customText: 'x'.repeat(200) }];
        const settings: Settings = { ...DEFAULT_SETTINGS, flexMode: 'full', colorLevel: 0 };
        const context: RenderContext = { isPreview: false, terminalWidth: 100 };
        const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
        const line = renderStatusLine(
            widgets,
            settings,
            context,
            preRenderedLines[0] ?? [],
            calculateMaxWidthsFromPreRendered(preRenderedLines, settings)
        );
        const reserved = 100 - getVisibleWidth(line);

        const [fullWidth] = buildTerminalWidthItems('full', 60);
        expect(fullWidth?.description).toContain(`full terminal width minus ${reserved} characters`);
    });

    it('marks the mode a config without flexMode gets as the default', () => {
        const defaultMode = DEFAULT_SETTINGS.flexMode;

        for (const selectedOption of TERMINAL_WIDTH_OPTIONS.filter(mode => mode !== defaultMode)) {
            const marked = buildTerminalWidthItems(selectedOption, 60)
                .filter(item => item.sublabel === '(default)')
                .map(item => item.value);
            expect(marked).toEqual([defaultMode]);
        }

        // Once the default is chosen, its active mark replaces the default one
        const items = buildTerminalWidthItems(defaultMode, 60);
        expect(items.find(item => item.value === defaultMode)?.sublabel).toBe('(active)');
        expect(items.some(item => item.sublabel === '(default)')).toBe(false);
    });

    it('returns the current option index for list selection', () => {
        expect(getTerminalWidthSelectionIndex('full')).toBe(0);
        expect(getTerminalWidthSelectionIndex('full-minus-40')).toBe(1);
        expect(getTerminalWidthSelectionIndex('full-until-compact')).toBe(2);
    });

    it('keeps full-until-compact selected after confirming the threshold prompt', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn();
        const onBack = vi.fn();
        const instance = render(
            React.createElement(TerminalWidthMenu, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    flexMode: 'full',
                    compactThreshold: 60
                },
                onUpdate,
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

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Full width always');
            });
            stdout.clearOutput();
            stdin.write('\u001B[B');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Full width minus 40');
            });
            stdout.clearOutput();
            stdin.write('\u001B[B');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Full width until compact');
            });
            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Enter compact threshold (1-99):');
            });

            stdout.clearOutput();

            stdin.write('\r');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
                    flexMode: 'full-until-compact',
                    compactThreshold: 60
                }));
                expect(stdout.getOutput()).toContain('▶  Full width until compact');
            });

            expect(stdout.getOutput()).not.toContain('▶  Full width always');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
