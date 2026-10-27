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
            sublabel: undefined,
            value: 'full-minus-40'
        });
        expect(items[2]).toMatchObject({
            label: 'Full width until compact',
            sublabel: '(threshold 60%, active)',
            value: 'full-until-compact'
        });
        expect(items[2]?.description).toContain('60%');
    });

    it('marks the mode new settings get as the default', () => {
        expect(DEFAULT_SETTINGS.flexMode).toBe('full');

        const fullMinus40Items = buildTerminalWidthItems('full-minus-40', 60);
        expect(fullMinus40Items[0]?.sublabel).toBe('(default)');
        expect(fullMinus40Items[1]?.sublabel).toBe('(active)');

        // The active mode says so, even when it is also the default
        const fullItems = buildTerminalWidthItems('full', 60);
        expect(fullItems[0]?.sublabel).toBe('(active)');
        expect(fullItems[1]?.sublabel).toBeUndefined();
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

describe('TerminalWidthMenu descriptions', () => {
    it('describes the columns full width always actually reserves', () => {
        const terminalWidth = 50;
        const widgets: WidgetItem[] = [
            { id: 'left', type: 'custom-text', customText: 'LEFT' },
            { id: 'flex', type: 'flex-separator' },
            { id: 'right', type: 'custom-text', customText: 'RIGHT' }
        ];
        const settings: Settings = { ...DEFAULT_SETTINGS, flexMode: 'full' };
        const context: RenderContext = { isPreview: false, terminalWidth };
        const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
        const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
        const line = renderStatusLine(widgets, settings, context, preRenderedLines[0] ?? [], maxWidths);
        const reserved = terminalWidth - getVisibleWidth(line);

        const fullItem = buildTerminalWidthItems('full', 60)[0];

        expect(fullItem?.description).toContain(`minus ${reserved} characters`);
    });
});
