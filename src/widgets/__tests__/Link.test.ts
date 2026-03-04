import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { LinkWidget } from '../Link';

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
});