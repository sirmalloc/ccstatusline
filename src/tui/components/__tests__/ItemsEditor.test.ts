import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React, { useState } from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import { ItemsEditor } from '../ItemsEditor';

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

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

function StatefulItemsEditor({ initialWidgets }: { initialWidgets: WidgetItem[] }) {
    const [widgets, setWidgets] = useState(initialWidgets);

    return React.createElement(ItemsEditor, {
        widgets,
        onUpdate: setWidgets,
        onBack: vi.fn(),
        lineNumber: 1,
        settings: DEFAULT_SETTINGS
    });
}

describe('ItemsEditor', () => {
    it('shows only non-default number styles beside the widget name', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'tokens-input' }] }),
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
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input');
            expect(stripAnsi(stdout.getOutput())).not.toContain('(compact)');

            stdout.clearOutput();
            stdin.write('.');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input (compact)');

            stdout.clearOutput();
            stdin.write('.');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input (whole)');

            stdout.clearOutput();
            stdin.write('.');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Tokens Input');
            expect(stripAnsi(stdout.getOutput())).not.toContain('(compact)');
            expect(stripAnsi(stdout.getOutput())).not.toContain('(whole)');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('preserves existing widget modifiers before the number style', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(ItemsEditor, {
                widgets: [{
                    id: '1',
                    type: 'cache-read',
                    metadata: { cacheScopeSession: 'true' },
                    numberFormat: { style: 'compact' }
                }],
                onUpdate: vi.fn(),
                onBack: vi.fn(),
                lineNumber: 1,
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
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Cache Read (session) (compact)');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
    it('edits a widget label and hides the label keybind in raw value mode', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'model' }] }),
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
            expect(stripAnsi(stdout.getOutput())).toContain('(e)dit label…');

            stdout.clearOutput();
            stdin.write('e');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('(default: "Model: ")');

            // Trim "Model: " down to "M", one backspace per keypress
            for (const key of Array.from('odel: ', () => '\x7f')) {
                stdin.write(key);
                await flushInk();
            }
            stdin.write(' ');
            await flushInk();
            stdout.clearOutput();
            stdin.write('\r');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Model (label: "M ")');

            stdout.clearOutput();
            stdin.write('r');
            await flushInk();
            const rawOutput = stripAnsi(stdout.getOutput());
            expect(rawOutput).toContain('(raw value)');
            expect(rawOutput).not.toContain('(e)dit label…');
            expect(rawOutput).not.toContain('(label:');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it.each([
        { query: 'session cost', name: 'Session Cost', keepsLabel: false },
        { query: 'model', name: 'Model', keepsLabel: true }
    ])('preserves the label only when reselecting the same type: $name', async ({ query, name, keepsLabel }) => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'model', metadata: { label: 'M ' } }] }),
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
            expect(stripAnsi(stdout.getOutput())).toContain('1. Model (label: "M ")');

            stdin.write('\x1b[C');
            await flushInk();
            for (const char of query) {
                stdin.write(char);
                await flushInk();
            }
            stdout.clearOutput();
            stdin.write('\r');
            await flushInk();
            const output = stripAnsi(stdout.getOutput());
            expect(output).toContain(`1. ${name}`);
            if (keepsLabel) {
                expect(output).toContain('(label: "M ")');
            } else {
                expect(output).not.toContain('(label:');
            }
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('keeps every key typed into the label editor before a re-render', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'model' }] }),
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
            stdin.write('e');
            await flushInk();

            // One macrotask apart: separate keypresses, but no re-render between them
            stdin.write('\x7f');
            await new Promise(resolve => setImmediate(resolve));
            stdin.write('\x7f');
            await flushInk();
            stdout.clearOutput();
            stdin.write('\r');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('1. Model (label: "Model")');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it.each([
        { type: 'model', openKey: 'e', prompt: '(default: "Model: ")', edit: 'X', expected: '1. Model (label: "Model: X")' },
        { type: 'model', openKey: 'e', prompt: '(default: "Model: ")', edit: '\x7f', expected: '1. Model (label: "Model:")' },
        { type: 'custom-text', openKey: 'e', prompt: 'Enter custom text:', edit: 'X', expected: '1. Custom Text (HelloX)' },
        { type: 'custom-text', openKey: 'e', prompt: 'Enter custom text:', edit: '\x7f', expected: '1. Custom Text (Hell)' }
    ])('saves the latest $type edit when Enter arrives before a redraw ($edit)', async ({ type, openKey, prompt, edit, expected }) => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type, customText: 'Hello' }] }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toContain('1. ');
            });
            stdout.clearOutput();
            stdin.write(openKey);
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toContain(prompt);
            });

            stdout.clearOutput();
            stdin.write(edit);
            await new Promise(resolve => setImmediate(resolve));
            stdin.write('\r');
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toContain(expected);
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('shows a joined emoji label in full beside its default', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'model', metadata: { label: '\u{1F469}\u200D\u{1F4BB} ' } }] }),
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
            stdout.clearOutput();
            stdin.write('e');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('"\u{1F469}\u200D\u{1F4BB} │" (default: "Model: ")');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('keeps a label equal to the bar-mode default for every mode, and Tab clears it', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();

        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'block-timer', metadata: { display: 'progress' } }] }),
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
            stdin.write('e');
            await flushInk();
            stdout.clearOutput();
            stdin.write('\r');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).toContain('(label: "Block ")');

            stdin.write('e');
            await flushInk();
            stdout.clearOutput();
            stdin.write('\t');
            await flushInk();
            expect(stripAnsi(stdout.getOutput())).not.toContain('(label:');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('offers (m)erge on the last widget only to clear a merge left on it', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        // Debug mode writes whole frames; the last one starts at the last title
        const lastFrame = () => {
            const output = stripAnsi(stdout.getOutput());
            return output.slice(output.lastIndexOf('Edit Line 1'));
        };

        const instance = render(
            React.createElement(StatefulItemsEditor, {
                initialWidgets: [
                    { id: '1', type: 'model' },
                    { id: '2', type: 'git-branch', merge: true }
                ]
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
                expect(lastFrame()).toContain('▶  1. Model');
            });

            stdin.write('\u001B[B');
            await waitFor(() => {
                expect(lastFrame()).toContain('▶  2. Git Branch (merged→)');
            });
            expect(lastFrame()).toContain('(m)erge');

            stdin.write('m');
            await waitFor(() => {
                expect(lastFrame()).toContain('▶  2. Git Branch');
                expect(lastFrame()).not.toContain('(merged→)');
            });
            expect(lastFrame()).not.toContain('(m)erge');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
