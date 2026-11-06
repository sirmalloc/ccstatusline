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
import { getVisibleWidth } from '../../../utils/ansi';
import { renderOsc8Link } from '../../../utils/hyperlink';
import * as sessionUsageHistory from '../../../utils/session-usage-history';
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

describe('StatusLinePreview helpers', () => {
    it('preserves OSC links and clamps preview lines to the terminal width', () => {
        const line = `${renderOsc8Link(
            'https://github.com/owner/repo/pull/42',
            'PR #42'
        )} OPEN ${'Example PR title '.repeat(8)}`;

        const prepared = preparePreviewLineForTerminal(line, 40);

        expect(prepared).toContain('\x1b]8;;https://github.com/owner/repo/pull/42\x07PR #42\x1b]8;;\x07');
        expect(prepared.endsWith('...')).toBe(true);
        expect(getVisibleWidth(`  ${prepared}`)).toBeLessThanOrEqual(40);
    });

    it('closes a truncated link before the ellipsis', () => {
        const line = renderOsc8Link('https://status.claude.com', 'Claude: ok ▮▮▮▮▮▮▮▮');

        expect(preparePreviewLineForTerminal(line, 15)).toBe(
            '\x1b]8;;https://status.claude.com\x07Claude: ok\x1b]8;;\x07...'
        );
    });

    it('keeps a shortened CWD label linked to its complete file URL in preview', () => {
        const target = 'file:///Users/example/Documents/Projects/%E4%B8%AD%E6%96%87%20project%20%231';
        const line = renderOsc8Link(target, 'cwd: ~/.../中文 project #1');
        const prepared = preparePreviewLineForTerminal(line, 160);

        expect(prepared).toBe(`\x1b]8;;${target}\x07cwd: ~/.../中文 project #1\x1b]8;;\x07`);
        expect(getVisibleWidth(prepared)).toBe(getVisibleWidth('cwd: ~/.../中文 project #1'));
        expect(getVisibleWidth(prepared)).toBeLessThan(
            getVisibleWidth('cwd: /Users/example/Documents/Projects/中文 project #1')
        );
    });

    it('still removes non-link OSC sequences', () => {
        expect(preparePreviewLineForTerminal('\x1b]0;title\x07Claude: ok', 40)).toBe('Claude: ok');
    });

    it.each([
        { powerline: false, history: false, linked: true },
        { powerline: false, history: true, linked: true },
        { powerline: true, history: false, linked: true },
        { powerline: true, history: true, linked: true },
        { powerline: false, history: false, linked: false }
    ])('renders the status link in Ink with %j', async ({ powerline, history, linked }) => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            powerline: { ...DEFAULT_SETTINGS.powerline, enabled: powerline }
        };
        const lines: WidgetItem[][] = [[{
            id: 'status',
            type: 'claude-status',
            metadata: { history: String(history), linkToStatusPage: String(linked) }
        }]];
        const instance = render(
            React.createElement(StatusLinePreview, { lines, terminalWidth: 160, settings }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Claude: ok');
            });
            const output = stdout.getOutput();
            if (linked) {
                expect(output).toContain('\x1b]8;;https://status.claude.com');
                expect(output).toContain('\x1b]8;;\x07');
            } else {
                expect(output).not.toContain('https://status.claude.com');
            }
            if (history) {
                expect(output).toContain('▮');
            }
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('renders a CWD file link in Ink with the shortened visible label', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            defaultPadding: ''
        };
        const lines: WidgetItem[][] = [[{
            id: 'cwd',
            type: 'current-working-dir',
            rawValue: true,
            metadata: { fishStyle: 'true', linkTo: 'file' }
        }]];
        const instance = render(
            React.createElement(StatusLinePreview, { lines, terminalWidth: 160, settings }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('~/D/P/my-project');
            });
            const output = stdout.getOutput();
            expect(output).toContain('file:///Users/example/Documents/Projects/my-project');
            expect(output).toContain('\x1b]8;;\x07');
            expect(getVisibleWidth('\x1b]8;;file:///Users/example/Documents/Projects/my-project\x07~/D/P/my-project\x1b]8;;\x07')).toBe('~/D/P/my-project'.length);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
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

    // The forecast widgets show samples here; only a real status-line render records
    // a reading, so browsing the TUI never adds to the history.
    it('previews the forecast widgets without recording a reading', async () => {
        const recordSpy = vi.spyOn(sessionUsageHistory, 'recordSessionUsageReading').mockReturnValue([]);
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const lines: WidgetItem[][] = [[
            { id: 'usage', type: 'session-usage' },
            { id: 'forecast', type: 'block-forecast' },
            { id: 'limit', type: 'block-limit-timer' }
        ]];

        const instance = render(
            React.createElement(StatusLinePreview, {
                lines,
                terminalWidth: 160,
                settings: DEFAULT_SETTINGS
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
                expect(stdout.getOutput()).toContain('Limit in: 1hr 13m');
            });

            expect(stdout.getOutput()).toContain('→100.0%');
            expect(recordSpy).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
            recordSpy.mockRestore();
        }
    });
});
