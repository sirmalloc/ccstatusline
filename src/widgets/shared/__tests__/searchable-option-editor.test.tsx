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

import type {
    WidgetEditorProps,
    WidgetItem
} from '../../../types/Widget';
import {
    filterLocaleOptions,
    getLocaleOptions
} from '../../../utils/locales';
import {
    filterTimezoneOptions,
    getTimezoneOptions
} from '../../../utils/timezones';
import {
    LOCALE_EDITOR_ACTION,
    UsageLocaleEditor
} from '../locale-editor';
import {
    TIMEZONE_EDITOR_ACTION,
    UsageTimezoneEditor
} from '../timezone-editor';

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

// Lets work React has already queued run first. Its scheduler runs on
// setImmediate, and it attaches input listeners in an effect just after
// drawing a frame, so a key sent as soon as the frame shows could be lost.
async function letReactCatchUp() {
    for (let turn = 0; turn < 2; turn++) {
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}

// Retries the assertions until they pass; a fixed delay races Ink on a busy machine
async function waitFor(assertions: () => void, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        try {
            assertions();
            await letReactCatchUp();
            return;
        } catch (error) {
            if (Date.now() >= deadline) {
                throw error;
            }
        }
    }
}

const UP = '\u001B[A';
const DOWN = '\u001B[B';
const BACKSPACE = '\u007F';
const ENTER = '\r';
const ESCAPE = '\u001B';

interface ListedOption {
    value: string;
    displayName: string;
    description: string;
}

interface EditorCase {
    name: string;
    Editor: React.FC<WidgetEditorProps>;
    action: string;
    metadataKey: 'locale' | 'timezone';
    title: string;
    defaultValue: string;
    emptyMessage: string;
    // A stored value and the option the editor opens on for it
    configured: { stored: string; selected: string };
    // A search that matches a few options
    query: string;
    listOptions: (current?: string) => ListedOption[];
    search: (query: string) => ListedOption[];
}

const EDITORS: EditorCase[] = [
    {
        name: 'UsageLocaleEditor',
        Editor: UsageLocaleEditor,
        action: LOCALE_EDITOR_ACTION,
        metadataKey: 'locale',
        title: 'Locale',
        defaultValue: 'en-US',
        emptyMessage: 'No locales match the search.',
        configured: { stored: 'ja-jp', selected: 'ja-JP' },
        query: 'french',
        listOptions: current => getLocaleOptions(current),
        search: query => filterLocaleOptions(getLocaleOptions(), query)
    },
    {
        name: 'UsageTimezoneEditor',
        Editor: UsageTimezoneEditor,
        action: TIMEZONE_EDITOR_ACTION,
        metadataKey: 'timezone',
        title: 'Timezone',
        defaultValue: 'UTC',
        emptyMessage: 'No timezones match the search.',
        configured: { stored: 'Asia/Tokyo', selected: 'Asia/Tokyo' },
        query: 'tokyo',
        listOptions: current => getTimezoneOptions(current),
        search: query => filterTimezoneOptions(getTimezoneOptions(), query)
    }
];

function renderEditor(editor: EditorCase, widget: WidgetItem, action = editor.action) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const instance = render(
        React.createElement(editor.Editor, {
            widget,
            onComplete,
            onCancel,
            action
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

    return {
        instance,
        stdin,
        stdout,
        stderr,
        onComplete,
        onCancel
    };
}

type RenderedEditor = ReturnType<typeof renderEditor>;

function cleanupEditor(rendered: RenderedEditor): void {
    rendered.instance.unmount();
    rendered.instance.cleanup();
    rendered.stdin.destroy();
    rendered.stdout.destroy();
    rendered.stderr.destroy();
}

function getPlainOutput(rendered: RenderedEditor): string {
    return stripAnsi(rendered.stdout.getOutput()).replace(/\r\n/g, '\n');
}

// The latest frame's line that starts with the prefix
function getLastLine(rendered: RenderedEditor, prefix: string): string | undefined {
    return getPlainOutput(rendered)
        .split('\n')
        .filter(line => line.startsWith(prefix))
        .at(-1);
}

// The highlighted row of the latest frame, without its marker
function getSelectedRow(rendered: RenderedEditor): string | undefined {
    return getLastLine(rendered, '>')?.slice(1).trim();
}

function getSearchLine(rendered: RenderedEditor): string | undefined {
    return getLastLine(rendered, 'Search: ');
}

function describeOption(option: ListedOption | undefined): string {
    return option ? `${option.displayName} - ${option.description}` : 'missing option';
}

async function pressKey(rendered: RenderedEditor, key: string, effect: () => void): Promise<void> {
    rendered.stdout.clearOutput();
    rendered.stdin.write(key);
    await waitFor(effect);
}

function getSavedValue(rendered: RenderedEditor, editor: EditorCase): unknown {
    const updated = rendered.onComplete.mock.calls[0]?.[0] as WidgetItem | undefined;
    return updated?.metadata?.[editor.metadataKey];
}

for (const editor of EDITORS) {
    describe(`${editor.name} list and search`, () => {
        it('opens on the default value with an empty search', async () => {
            const options = editor.listOptions();
            const rendered = renderEditor(editor, { id: 'reset', type: 'reset-timer' });

            try {
                await waitFor(() => {
                    const output = getPlainOutput(rendered);
                    expect(output).toContain(`${editor.title} Current: ${editor.defaultValue}`);
                    expect(output).toContain('Search: (none)');
                    expect(output).toContain('Type to search, Up/Down select, Enter save, ESC cancel');
                    expect(output).toContain(`Showing 1-10 of ${options.length}`);
                    expect(getSelectedRow(rendered)).toBe(describeOption(options.find(option => option.value === editor.defaultValue)));
                });
            } finally {
                cleanupEditor(rendered);
            }
        });

        it('opens on the configured value and Enter keeps it', async () => {
            const { stored, selected } = editor.configured;
            const options = editor.listOptions(stored);
            const rendered = renderEditor(editor, {
                id: 'reset',
                type: 'reset-timer',
                metadata: { [editor.metadataKey]: stored }
            });

            try {
                await waitFor(() => {
                    expect(getPlainOutput(rendered)).toContain(`${editor.title} Current: ${stored}`);
                    expect(getSelectedRow(rendered)).toBe(describeOption(options.find(option => option.value === selected)));
                });

                rendered.stdin.write(ENTER);
                await waitFor(() => {
                    expect(rendered.onComplete).toHaveBeenCalledOnce();
                });
                expect(getSavedValue(rendered, editor)).toBe(selected);
            } finally {
                cleanupEditor(rendered);
            }
        });

        it('moves the selection with Up and Down, wrapping at both ends and scrolling the list', async () => {
            const options = editor.listOptions();
            const total = options.length;
            const rendered = renderEditor(editor, { id: 'reset', type: 'reset-timer' });

            try {
                await waitFor(() => {
                    expect(getSelectedRow(rendered)).toBe(describeOption(options[0]));
                });

                await pressKey(rendered, UP, () => {
                    expect(getSelectedRow(rendered)).toBe(describeOption(options[total - 1]));
                    expect(getPlainOutput(rendered)).toContain(`Showing ${total - 9}-${total} of ${total}`);
                });

                await pressKey(rendered, DOWN, () => {
                    expect(getSelectedRow(rendered)).toBe(describeOption(options[0]));
                    expect(getPlainOutput(rendered)).toContain(`Showing 1-10 of ${total}`);
                });

                // The list scrolls once the selection passes the middle of the window
                for (let index = 1; index <= 6; index++) {
                    await pressKey(rendered, DOWN, () => {
                        expect(getSelectedRow(rendered)).toBe(describeOption(options[index]));
                    });
                }
                expect(getPlainOutput(rendered)).toContain(`Showing 2-11 of ${total}`);

                rendered.stdin.write(ENTER);
                await waitFor(() => {
                    expect(rendered.onComplete).toHaveBeenCalledOnce();
                });
                expect(getSavedValue(rendered, editor)).toBe(options[6]?.value);
            } finally {
                cleanupEditor(rendered);
            }
        });

        it('filters as you type and selects the first match after each change', async () => {
            const matches = editor.search(editor.query);
            const shorterQuery = editor.query.slice(0, -1);
            const shorterMatches = editor.search(shorterQuery);
            const rendered = renderEditor(editor, { id: 'reset', type: 'reset-timer' });

            try {
                await waitFor(() => {
                    expect(getPlainOutput(rendered)).toContain('Search: (none)');
                });

                await pressKey(rendered, editor.query, () => {
                    expect(getSearchLine(rendered)).toBe(`Search: ${editor.query}`);
                    expect(getSelectedRow(rendered)).toBe(describeOption(matches[0]));
                });

                await pressKey(rendered, DOWN, () => {
                    expect(getSelectedRow(rendered)).toBe(describeOption(matches[1]));
                });

                await pressKey(rendered, BACKSPACE, () => {
                    expect(getSearchLine(rendered)).toBe(`Search: ${shorterQuery}`);
                    expect(getSelectedRow(rendered)).toBe(describeOption(shorterMatches[0]));
                });

                rendered.stdin.write(ENTER);
                await waitFor(() => {
                    expect(rendered.onComplete).toHaveBeenCalledOnce();
                });
                expect(getSavedValue(rendered, editor)).toBe(shorterMatches[0]?.value);
            } finally {
                cleanupEditor(rendered);
            }
        });

        it('says when nothing matches, and Enter then saves nothing', async () => {
            const rendered = renderEditor(editor, { id: 'reset', type: 'reset-timer' });

            try {
                await waitFor(() => {
                    expect(getPlainOutput(rendered)).toContain('Search: (none)');
                });

                await pressKey(rendered, 'zzqx9', () => {
                    const output = getPlainOutput(rendered);
                    expect(output).toContain(editor.emptyMessage);
                    expect(output).not.toContain('Showing');
                    expect(getSelectedRow(rendered)).toBeUndefined();
                });

                rendered.stdin.write(DOWN);
                await letReactCatchUp();
                rendered.stdin.write(ENTER);
                await letReactCatchUp();

                // Keys are handled in order, so once this shows, Down and Enter were handled
                await pressKey(rendered, BACKSPACE, () => {
                    expect(getSearchLine(rendered)).toBe('Search: zzqx');
                    expect(getPlainOutput(rendered)).toContain(editor.emptyMessage);
                });

                rendered.stdin.write(ESCAPE);
                await waitFor(() => {
                    expect(rendered.onCancel).toHaveBeenCalledOnce();
                });
                expect(rendered.onComplete).not.toHaveBeenCalled();
            } finally {
                cleanupEditor(rendered);
            }
        });

        it('shows nothing but a notice for another editor action', async () => {
            const rendered = renderEditor(editor, { id: 'reset', type: 'reset-timer' }, 'some-other-action');

            try {
                await waitFor(() => {
                    expect(getPlainOutput(rendered)).toContain('Unknown editor mode');
                });
                expect(getPlainOutput(rendered)).not.toContain(editor.title);
            } finally {
                cleanupEditor(rendered);
            }
        });
    });
}
