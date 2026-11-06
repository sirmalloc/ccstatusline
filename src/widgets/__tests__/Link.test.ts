import { render } from 'ink';
import { PassThrough } from 'node:stream';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { forceInkColors } from '../../tui/__tests__/helpers/ink-colors';
import { waitFor } from '../../tui/__tests__/helpers/wait-for-ink';
import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { LinkWidget } from '../Link';

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

function renderLink(
    metadata: Record<string, string> | undefined,
    isPreview = false,
    rawValue = false
): string | null {
    const widget = new LinkWidget();
    const item: WidgetItem = {
        id: 'link',
        type: 'link',
        metadata,
        rawValue
    };
    const context: RenderContext = { isPreview };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('LinkWidget', () => {
    it('renders OSC 8 hyperlink for valid http URL', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        });

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('uses URL as display text when metadata.text is missing', () => {
        const result = renderLink({ url: 'https://example.com/docs' });

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 https://example.com/docs\x1b]8;;\x1b\\');
    });

    it('percent-encodes characters a link can\'t carry as they are', () => {
        const result = renderLink({ url: 'https://example.com/a b/\x1b]52;c;AAAA\x07/docs', text: 'Docs' });

        expect(result).toBe('\x1b]8;;https://example.com/a%20b/%1B]52;c;AAAA%07/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('falls back to plain text for non-http URL schemes', () => {
        const result = renderLink({
            url: 'file:///tmp/report.txt',
            text: 'Report'
        });

        expect(result).toBe('🔗 Report');
    });

    it('shows default placeholder when URL and text are missing', () => {
        const result = renderLink(undefined);

        expect(result).toBe('🔗 no url');
    });

    it('renders preview text exactly like final visible output when unconfigured', () => {
        const result = renderLink(undefined, true);
        expect(result).toBe('🔗 no url');
    });

    it('renders preview text exactly like final visible output when configured', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, true);
        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('renders preview hyperlink in raw mode with emoji hidden', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, true, true);
        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\Docs\x1b]8;;\x1b\\');
    });

    it('hides emoji in raw mode while preserving hyperlink behavior', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, false, true);

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\Docs\x1b]8;;\x1b\\');
    });

    it('shows raw placeholder without emoji when unconfigured', () => {
        const result = renderLink(undefined, false, true);
        expect(result).toBe('no url');
    });

    it('exposes edit URL and edit text keybinds', () => {
        const widget = new LinkWidget();
        const keybinds = widget.getCustomKeybinds();

        expect(keybinds).toEqual([
            { key: 'u', label: '(u)rl', action: 'edit-url' },
            { key: 'e', label: '(e)dit text', action: 'edit-text' }
        ]);
    });

    it('returns editor display with text and short url', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            metadata: {
                url: 'https://example.com/docs',
                text: 'Docs'
            }
        });

        expect(display.displayText).toBe('Link (🔗 Docs)');
        expect(display.modifierText).toBe('(https://example.com/docs)');
    });

    it('omits duplicate no-url modifier when unconfigured in raw mode', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            rawValue: true
        });

        expect(display.displayText).toBe('Link (no url)');
        expect(display.modifierText).toBeUndefined();
    });

    it('omits duplicate url modifier when raw mode label is the URL', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            rawValue: true,
            metadata: { url: 'https://google.com' }
        });

        expect(display.displayText).toBe('Link (https://google.com)');
        expect(display.modifierText).toBeUndefined();
    });

    it('supports colors and raw value mode', () => {
        const widget = new LinkWidget();
        const item: WidgetItem = { id: 'link', type: 'link' };

        expect(widget.supportsColors(item)).toBe(true);
        expect(widget.supportsRawValue()).toBe(true);
    });

    describe('editor', () => {
        const LEFT = '\x1b[D';
        const RIGHT = '\x1b[C';
        const BACKSPACE = '\x7f';
        const DELETE = '\x1b[3~';
        const CODER = '\u{1F469}\u200D\u{1F4BB}';

        function renderLinkEditor(metadata: Record<string, string>, action: string) {
            const stdin = createMockStdin();
            const stdout = createMockStdout();
            const stderr = createMockStdout();
            const onComplete = vi.fn();
            const instance = render(
                new LinkWidget().renderEditor({
                    widget: { id: 'link', type: 'link', metadata },
                    onComplete,
                    onCancel: vi.fn(),
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
                onComplete,
                output: () => stdout.getOutput(),
                // Every key here moves the cursor or changes the text, so each
                // waits for the redraw before the next one goes out
                press: async (key: string) => {
                    const drawn = stdout.getOutput().length;
                    stdin.write(key);
                    await waitFor(() => {
                        expect(stdout.getOutput().length).toBeGreaterThan(drawn);
                    });
                },
                ready: () => waitFor(() => {
                    expect(stdout.getOutput()).toContain('Enter ');
                }),
                save: async () => {
                    stdin.write('\r');
                    await waitFor(() => {
                        expect(onComplete).toHaveBeenCalledTimes(1);
                    });
                    return (onComplete.mock.calls[0]?.[0] as WidgetItem).metadata;
                },
                cleanup: () => {
                    instance.unmount();
                    instance.cleanup();
                    stdin.destroy();
                    stdout.destroy();
                    stderr.destroy();
                }
            };
        }

        it.each([
            { name: 'Backspace deletes an emoji in the text', action: 'edit-text', value: 'Docs \u{1F4D8}', keys: [BACKSPACE], saved: 'Docs' },
            { name: 'Backspace deletes a joined emoji in the text', action: 'edit-text', value: `Docs ${CODER}`, keys: [BACKSPACE], saved: 'Docs' },
            { name: 'Left steps over an emoji in the text', action: 'edit-text', value: 'Docs \u{1F4D8}', keys: [LEFT, 'x'], saved: 'Docs x\u{1F4D8}' },
            { name: 'Right steps over an emoji in the text', action: 'edit-text', value: 'Docs \u{1F4D8}', keys: [LEFT, LEFT, RIGHT, 'x'], saved: 'Docs x\u{1F4D8}' },
            { name: 'Delete deletes an emoji in the URL', action: 'edit-url', value: 'https://example.com/\u{1F680}', keys: [LEFT, DELETE], saved: 'https://example.com/' }
        ])('$name whole', async ({ action, value, keys, saved }) => {
            const field = action === 'edit-url' ? 'url' : 'text';
            const editor = renderLinkEditor(field === 'url' ? { url: value } : { url: 'https://example.com', text: value }, action);

            try {
                await editor.ready();
                for (const key of keys) {
                    await editor.press(key);
                }
                expect((await editor.save())?.[field]).toBe(saved);
            } finally {
                editor.cleanup();
            }
        });

        it('draws the whole emoji under the cursor', async () => {
            // Without colors the cursor cell has no codes around it, so a
            // split emoji would rejoin in the frame and look whole
            const colors = await forceInkColors();
            const editor = renderLinkEditor({ url: 'https://example.com', text: 'Docs \u{1F4D8}' }, 'edit-text');

            try {
                await editor.ready();
                await editor.press(LEFT);
                await waitFor(() => {
                    expect(editor.output()).toContain(`Docs ${colors.chalk.bgGray.black('\u{1F4D8}')}`);
                });
                expect(editor.output()).not.toContain('\uFFFD');
            } finally {
                editor.cleanup();
                colors.restore();
            }
        });
    });
});
