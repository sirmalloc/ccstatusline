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
import { getWidgetCatalog } from '../../../utils/widgets';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import { ItemsEditor } from '../ItemsEditor';
import {
    getDescriptionRows,
    getPickerMaxVisible
} from '../items-editor/list-window';

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
            expect(stripAnsi(stdout.getOutput())).toContain('"\u{1F469}\u200D\u{1F4BB}  " (default: "Model: ")');
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

    it('starts on the given widget and reports where the cursor moves', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onSelectedIndexChange = vi.fn<(index: number) => void>();

        const instance = render(
            React.createElement(ItemsEditor, {
                widgets: [{ id: '1', type: 'model' }, { id: '2', type: 'tokens-input' }, { id: '3', type: 'tokens-output' }],
                onUpdate: vi.fn(),
                onBack: vi.fn(),
                initialSelectedIndex: 1,
                onSelectedIndexChange,
                lineNumber: 1,
                settings: DEFAULT_SETTINGS
            }),
            { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false }
        );

        try {
            await waitFor(() => {
                expect(stripAnsi(stdout.getOutput())).toMatch(/▶\s+2\. Tokens Input/);
            });

            stdin.write('\x1b[B');
            await waitFor(() => {
                expect(onSelectedIndexChange).toHaveBeenLastCalledWith(2);
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    describe('widget picker', () => {
        const ESC = '\x1b';
        const ENTER = '\r';
        const UP_ARROW = '\x1b[A';
        const RIGHT_ARROW = '\x1b[C';
        const allWidgetCount = getWidgetCatalog(DEFAULT_SETTINGS).length;

        function getEntryRows(output: string): string[] {
            return output.split('\n').filter(row => /^\s*(▶\s+)?\d+\. /.test(row));
        }

        function renderEditor(widgets: WidgetItem[], settings = DEFAULT_SETTINGS) {
            const stdin = createMockStdin();
            const stdout = createMockStdout();
            const stderr = createMockStdout();
            const previews: (WidgetItem[] | null)[] = [];
            const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();

            const instance = render(
                React.createElement(ItemsEditor, {
                    widgets,
                    onUpdate,
                    onBack: vi.fn(),
                    onPreviewChange: (preview: WidgetItem[] | null) => { previews.push(preview); },
                    lineNumber: 1,
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

            // Output written since the last key press
            const screen = () => stripAnsi(stdout.getOutput());

            return {
                instance,
                onUpdate,
                // Sends keys without waiting; follow with waitFor on what they change
                press: (input: string) => {
                    stdout.clearOutput();
                    stdin.write(input);
                },
                screen,
                // The last picker frame drawn since the last key press
                latestPickerFrame: () => {
                    const output = screen();
                    const start = output.lastIndexOf('ADD WIDGET');
                    return start === -1 ? '' : output.slice(start);
                },
                // The line editor is drawn and listening for keys
                ready: () => waitFor(() => {
                    expect(screen()).toContain('1. ');
                }),
                latestPreview: () => previews.at(-1),
                cleanup: () => {
                    instance.unmount();
                    instance.cleanup();
                    stdin.destroy();
                    stdout.destroy();
                    stderr.destroy();
                }
            };
        }

        it('shows the highlighted widget added after the cursor until the picker is cancelled', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                // Browsing categories highlights no widget, so the line is untouched
                expect(editor.latestPreview() ?? null).toBeNull();

                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);
                });

                // The first ESC clears the search, the second closes the picker
                editor.press(ESC);
                await waitFor(() => {
                    expect(editor.latestPreview()).toBeNull();
                });
                editor.press(ESC);
                await waitFor(() => {
                    expect(editor.screen()).toContain('Edit Line 1');
                    expect(editor.screen()).not.toContain('ADD WIDGET');
                });
                expect(editor.onUpdate).not.toHaveBeenCalled();
            } finally {
                editor.cleanup();
            }
        });

        it('shows the widget at the cursor with its type swapped when changing type', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }, { id: '2', type: 'tokens-input' }]);

            try {
                await editor.ready();
                editor.press(RIGHT_ARROW);
                await waitFor(() => {
                    expect(editor.screen()).toContain('CHANGE WIDGET TYPE');
                });
                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()).toEqual([
                        { id: '1', type: 'git-branch' },
                        { id: '2', type: 'tokens-input' }
                    ]);
                });
            } finally {
                editor.cleanup();
            }
        });

        it('applies exactly the previewed line, powerline background included, on Enter', async () => {
            const powerlineSettings = {
                ...DEFAULT_SETTINGS,
                powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true }
            };
            const editor = renderEditor([{ id: '1', type: 'model', backgroundColor: 'bgRed' }], powerlineSettings);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);
                });
                const preview = editor.latestPreview();
                expect(preview?.[1]?.backgroundColor).toEqual(expect.any(String));
                expect(preview?.[1]?.backgroundColor).not.toBe('bgRed');

                editor.press(ENTER);
                await waitFor(() => {
                    expect(editor.onUpdate).toHaveBeenCalledTimes(1);
                    expect(editor.latestPreview()).toBeNull();
                });
                expect(editor.onUpdate).toHaveBeenCalledWith(preview);
            } finally {
                editor.cleanup();
            }
        });

        it('shows a window of a long list and counts the entries hidden below it', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press(ENTER);
                await waitFor(() => {
                    expect(editor.latestPickerFrame()).toMatch(/↓ \d+ more/);
                });
                const output = editor.latestPickerFrame();

                const shown = getEntryRows(output).length;
                const hiddenBelow = Number(/↓ (\d+) more/.exec(output)?.[1]);
                expect(shown).toBeGreaterThan(0);
                expect(shown).toBeLessThan(allWidgetCount);
                expect(shown + hiddenBelow).toBe(allWidgetCount);
                expect(output).not.toMatch(/↑ \d+ more/);
            } finally {
                editor.cleanup();
            }
        });

        // The highlighted widget's description shows under the list, so the
        // list gives up rows for the tallest one it holds (the mock terminal
        // is 120 columns, less the description's indent of 2)
        it('leaves room under the list for its tallest description', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);
            const tallest = Math.max(...getWidgetCatalog(DEFAULT_SETTINGS).map(entry => getDescriptionRows(entry.description, 118)));
            const statusLines = DEFAULT_SETTINGS.lines.filter(line => line.length > 0).length;

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press(ENTER);
                await waitFor(() => {
                    expect(editor.latestPickerFrame()).toMatch(/↓ \d+ more/);
                });

                expect(tallest).toBeGreaterThan(1);
                expect(getEntryRows(editor.latestPickerFrame())).toHaveLength(getPickerMaxVisible(40, statusLines, tallest));
            } finally {
                editor.cleanup();
            }
        });

        it('scrolls the window to keep the highlighted widget visible', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press(ENTER);
                await waitFor(() => {
                    expect(editor.latestPickerFrame()).toMatch(/↓ \d+ more/);
                });
                // Up from the first widget wraps to the last one
                editor.press(UP_ARROW);
                await waitFor(() => {
                    const highlighted = getEntryRows(editor.latestPickerFrame()).find(row => row.includes('▶'));
                    expect(highlighted).toMatch(new RegExp(`${allWidgetCount}\\. `));
                });
                const output = editor.latestPickerFrame();
                const rows = getEntryRows(output);

                expect(rows.some(row => /^\s*1\. /.test(row))).toBe(false);
                expect(output).toMatch(/↑ \d+ more/);
                expect(output).not.toMatch(/↓ \d+ more/);
            } finally {
                editor.cleanup();
            }
        });

        it('clears the preview when the editor is closed mid-pick', async () => {
            const editor = renderEditor([{ id: '1', type: 'model' }]);

            try {
                await editor.ready();
                editor.press('a');
                await waitFor(() => {
                    expect(editor.screen()).toContain('ADD WIDGET');
                });
                editor.press('git branch');
                await waitFor(() => {
                    expect(editor.latestPreview()?.map(widget => widget.type)).toEqual(['model', 'git-branch']);
                });

                editor.instance.unmount();
                expect(editor.latestPreview()).toBeNull();
            } finally {
                editor.cleanup();
            }
        });
    });
});
