import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { stripSgrCodes } from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    renderStatusLine,
    type PreRenderedWidget
} from '../renderer';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        colorLevel: 0,
        defaultPadding: '.',
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function pre(content: string, extra: Partial<WidgetItem> = {}): PreRenderedWidget {
    return { content, plainLength: content.length, widget: { id: content, type: 'custom-text', ...extra } };
}

function text(content: string, extra: Partial<WidgetItem> = {}): WidgetItem {
    return { id: content, type: 'custom-text', customText: content, ...extra };
}

function powerlineSettings(overrides: Partial<Settings> = {}): Settings {
    return createSettings({
        ...overrides,
        powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, separators: ['|'] }
    });
}

// Assertions below only care about visible content and spacing, never
// styling, so every render() call returns SGR-stripped output. This matches
// the repo convention (see stripSgrCodes usage in renderer-flex-width.test.ts
// and the separator-collapse tests) and keeps assertions stable regardless of
// chalk's ambient color-support detection (e.g. under FORCE_COLOR/NO_COLOR),
// which is independent of the `colorLevel` set on Settings.
function render(widgets: WidgetItem[], contentByIndex: Record<number, string>, settings: Settings): string {
    const context: RenderContext = { isPreview: false, terminalWidth: 200 };
    const preRenderedWidgets = widgets.map((widget, i) => {
        const content = contentByIndex[i] ?? '';
        return { content, plainLength: content.length, widget };
    });
    return stripSgrCodes(renderStatusLine(widgets, settings, context, preRenderedWidgets, []));
}

describe('defaultPaddingSide', () => {
    it('defaults to "both", preserving existing behavior', () => {
        expect(DEFAULT_SETTINGS.defaultPaddingSide).toBe('both');
    });

    describe('standard (non-powerline) rendering', () => {
        it('applies padding to both sides by default', () => {
            const settings = createSettings();
            const out = render([text('a')], { 0: 'A' }, settings);
            expect(out).toBe('.A.');
        });

        it('applies padding to the left only when side is "left"', () => {
            const settings = createSettings({ defaultPaddingSide: 'left' });
            const out = render([text('a')], { 0: 'A' }, settings);
            expect(out).toBe('.A');
        });

        it('applies padding to the right only when side is "right"', () => {
            const settings = createSettings({ defaultPaddingSide: 'right' });
            const out = render([text('a')], { 0: 'A' }, settings);
            expect(out).toBe('A.');
        });
    });

    describe('powerline rendering', () => {
        it('applies padding to both sides by default', () => {
            const out = render([text('a')], { 0: 'A' }, powerlineSettings());
            expect(out).toContain('.A.');
        });

        it('applies padding to the left only when side is "left"', () => {
            const settings = powerlineSettings({ defaultPaddingSide: 'left' });
            const widgets = [text('a'), text('b')];
            const out = render(widgets, { 0: 'A', 1: 'B' }, settings);
            expect(out).toContain('.A');
            expect(out).not.toContain('A.');
        });

        it('applies padding to the right only when side is "right"', () => {
            const settings = powerlineSettings({ defaultPaddingSide: 'right' });
            const widgets = [text('a'), text('b')];
            const out = render(widgets, { 0: 'A', 1: 'B' }, settings);
            expect(out).toContain('A.');
            expect(out).not.toContain('.A');
        });
    });

    describe('merge: "no-padding" takes precedence over the padding-side setting', () => {
        it.each([
            {
                side: 'left' as const,
                // Side 'left' means B's own leading pad would already be '.', so
                // the no-padding merge must be what suppresses it (glue "AB").
                withoutMerge: '.A.B',
                withMerge: '.AB'
            },
            {
                side: 'right' as const,
                // Side 'right' means A's own trailing pad would already be '.', so
                // the no-padding merge must be what suppresses it (glue "AB").
                withoutMerge: 'A.B.',
                withMerge: 'AB.'
            }
        ])('standard mode, side "$side": no double-pad and correct glue across a no-padding merge boundary', ({ side, withoutMerge, withMerge }) => {
            const settings = createSettings({ defaultPaddingSide: side });

            const baseline = render([text('a'), text('b')], { 0: 'A', 1: 'B' }, settings);
            expect(baseline).toBe(withoutMerge);

            const merged = render([text('a', { merge: 'no-padding' }), text('b')], { 0: 'A', 1: 'B' }, settings);
            expect(merged).toBe(withMerge);
        });

        it.each([
            { side: 'left' as const },
            { side: 'right' as const }
        ])('powerline mode, side "$side": no double-pad, no separator, and correct glue across a no-padding merge boundary', ({ side }) => {
            const settings = powerlineSettings({ defaultPaddingSide: side });

            const baseline = render([text('a'), text('b')], { 0: 'A', 1: 'B' }, settings);
            // Without the merge, A and B are separate segments joined by the
            // powerline separator.
            expect(baseline).toContain('|');

            const merged = render([text('a', { merge: 'no-padding' }), text('b')], { 0: 'A', 1: 'B' }, settings);
            // With the no-padding merge, A and B glue directly together: no
            // separator, and no padding character sits between them.
            expect(merged).not.toContain('|');
            expect(merged).toContain('AB');
        });
    });

    describe('calculateMaxWidthsFromPreRendered width accounting', () => {
        it('counts padding on both sides by default', () => {
            const lines = [[pre('AB')]];
            const settings = createSettings({ defaultPadding: '..' });
            // 'AB' (2) + 2 leading + 2 trailing = 6
            expect(calculateMaxWidthsFromPreRendered(lines, settings)).toEqual([6]);
        });

        it('counts padding only once when side is "left"', () => {
            const lines = [[pre('AB')]];
            const settings = createSettings({ defaultPadding: '..', defaultPaddingSide: 'left' });
            // 'AB' (2) + 2 leading + 0 trailing = 4
            expect(calculateMaxWidthsFromPreRendered(lines, settings)).toEqual([4]);
        });

        it('counts padding only once when side is "right"', () => {
            const lines = [[pre('AB')]];
            const settings = createSettings({ defaultPadding: '..', defaultPaddingSide: 'right' });
            // 'AB' (2) + 0 leading + 2 trailing = 4
            expect(calculateMaxWidthsFromPreRendered(lines, settings)).toEqual([4]);
        });
    });
});
