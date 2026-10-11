import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { getVisibleWidth } from '../../../utils/ansi';
import { getColorAnsiCode } from '../../../utils/colors';
import { renderOsc8Link } from '../../../utils/hyperlink';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import {
    StatusLinePreview,
    preparePreviewLineForTerminal
} from '../StatusLinePreview';

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

// Ink batches renders; one macrotask is enough for these small trees.
function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

describe('StatusLinePreview helpers', () => {
    it('strips OSC links and clamps preview lines to the terminal width', () => {
        const line = `${renderOsc8Link(
            'https://github.com/owner/repo/pull/42',
            'PR #42'
        )} OPEN ${'Example PR title '.repeat(8)}`;

        const prepared = preparePreviewLineForTerminal(line, 40);

        expect(prepared).not.toContain('github.com');
        expect(prepared.endsWith('...')).toBe(true);
        expect(getVisibleWidth(`  ${prepared}`)).toBeLessThanOrEqual(40);
    });

    it('keeps parens dim scoped in the Ink preview when global bold is active', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            globalBold: true,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'custom',
                separators: ['\uE0B0'],
                separatorInvertBackground: [false]
            }
        };
        const lines: WidgetItem[][] = [[
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'Cache Hit: 87.0%',
                color: 'hex:282C34',
                backgroundColor: 'hex:61AFEF'
            },
            {
                id: 'w2',
                type: 'custom-text',
                customText: 'Cache Read: 12k (64.0%)',
                color: 'hex:ABB2BF',
                backgroundColor: 'hex:3E4452',
                dim: 'parens'
            },
            {
                id: 'w3',
                type: 'custom-text',
                customText: 'Cache Write: 3k (16.0%)',
                color: 'hex:282C34',
                backgroundColor: 'hex:98C379'
            }
        ]];

        const instance = render(
            React.createElement(StatusLinePreview, {
                lines,
                terminalWidth: 160,
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

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Cache Write');
            });
            const output = stdout.getOutput();
            const dimIndex = output.indexOf('\x1b[2m(64.0%)');
            const resetIndex = output.indexOf('\x1b[22;1m', dimIndex);
            const nextWidgetIndex = output.indexOf('Cache Write');

            expect(dimIndex).toBeGreaterThanOrEqual(0);
            expect(resetIndex).toBeGreaterThan(dimIndex);
            expect(resetIndex).toBeLessThan(nextWidgetIndex);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('restarts the global theme chain after a line with its own theme', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'nord-aurora',
                continueThemeAcrossLines: true
            },
            lineThemes: [undefined, 'dracula']
        };
        const lines: WidgetItem[][] = [
            [{ id: 'a1', type: 'custom-text', customText: 'ONE' }],
            [{ id: 'b1', type: 'custom-text', customText: 'TWO' }],
            [{ id: 'c1', type: 'custom-text', customText: 'THREE' }]
        ];

        const instance = render(
            React.createElement(StatusLinePreview, {
                lines,
                terminalWidth: 160,
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

        try {
            await flushInk();
            const output = stdout.getOutput();
            const threeIndex = output.indexOf('THREE');
            expect(threeIndex).toBeGreaterThan(0);

            // Line 1 (global theme) consumed slot 0, line 2 (own theme) broke
            // the chain — so line 3 must restart at nord-aurora slot 0, not
            // continue at slot 2.
            const prefix = output.slice(Math.max(0, threeIndex - 120), threeIndex);
            expect(prefix).toContain(getColorAnsiCode('hex:BF616A', 'truecolor', true));
            expect(prefix).not.toContain(getColorAnsiCode('hex:5E81AC', 'truecolor', true));
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
