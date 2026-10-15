import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { renderOsc8Link } from '../hyperlink';
import { preRenderAllWidgets } from '../renderer';

// Upstream 3d94211 (GHSA-8j6h-phgx-ww84): widget text reaches the terminal
// from places the session controls — the directory, branch names, imported
// settings — so control sequences in it must be dropped before printing,
// keeping only SGR colors and OSC 8 hyperlinks with safe URLs.

const context: RenderContext = { isPreview: false, terminalWidth: 200 };

function renderOne(widget: WidgetItem): string {
    const [line = []] = preRenderAllWidgets([[widget]], DEFAULT_SETTINGS, context);

    return line[0]?.content ?? '';
}

describe('upstream 3d94211: terminal control sequences are sanitized', () => {
    it('drops osc titles and csi sequences from widget output', () => {
        const widget: WidgetItem = {
            id: 'text',
            type: 'custom-text',
            customText: '\x1b]0;pwned\x07title \x1b[2Jclear end'
        };

        expect(renderOne(widget)).toBe('title clear end');
    });

    it('drops c1 controls consumed as sequences by terminals', () => {
        const widget: WidgetItem = {
            id: 'text',
            type: 'custom-text',
            customText: 'ok\x9b2Jx'
        };

        expect(renderOne(widget)).toBe('ok2Jx');
    });

    it('consumes complete string sequences and charset escapes', () => {
        const widget: WidgetItem = {
            id: 'text',
            type: 'custom-text',
            customText: '\x1bP1$r\x1b\\DCS \x1bXbody\x1b^body2\x1b_body3\x1b\\tail \x1b(Bx'
        };

        expect(renderOne(widget)).toBe('DCS tail x');
    });

    it('consumes an unterminated csi sequence up to the end', () => {
        const widget: WidgetItem = {
            id: 'text',
            type: 'custom-text',
            customText: 'keep\x1b[99'
        };

        expect(renderOne(widget)).toBe('keep');
    });

    it('keeps sgr colors and osc8 hyperlinks through sanitization', () => {
        const widget: WidgetItem = {
            id: 'text',
            type: 'custom-text',
            customText: '\x1b[31mred\x1b[0m \x1b]8;id=1;https://example.com\x1b\\link\x1b]8;;\x1b\\'
        };

        expect(renderOne(widget)).toBe(
            '\x1b[31mred\x1b[0m \x1b]8;id=1;https://example.com\x1b\\link\x1b]8;;\x1b\\'
        );
    });

    it.each([
        ['a\x1b[ qb', 'ab'],
        ['a\x1b[?25hb', 'ab'],
        ['a\x1b[2\x07Jb', 'aJb'],
        ['a\x1b[0@b', 'ab'],
        ['a\x1b[24~b', 'ab'],
        ['a\x1b 0b', 'ab'],
        ['a\x1b ~b', 'ab'],
        ['a\x1b (b', 'a'],
        ['a\x1b/(bc', 'ac'],
        ['a\x1b/\x07bc', 'abc'],
        ['a\x1bPtail', 'a']
    ])('consumes %s up to its final byte', (raw, expected) => {
        const widget: WidgetItem = { id: 'text', type: 'custom-text', customText: raw };

        expect(renderOne(widget)).toBe(expected);
    });

    it('refuses to link a url holding control characters', () => {
        const unsafe = renderOsc8Link('https://example.com/\x07\x1b]0;pwned\x07', 'label');

        expect(unsafe).toBe('label');
    });

    it('still links a safe url', () => {
        const safe = renderOsc8Link('https://example.com/page', 'label');

        expect(safe).toBe('\x1b]8;;https://example.com/page\x1b\\label\x1b]8;;\x1b\\');
    });
});
