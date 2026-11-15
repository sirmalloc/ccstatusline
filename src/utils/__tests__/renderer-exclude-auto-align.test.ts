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
import { getVisibleWidth } from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine,
    type PreRenderedWidget
} from '../renderer';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        defaultPadding: '',
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

describe('calculateMaxWidthsFromPreRendered with excludeFromAutoAlign', () => {
    it.each([
        { name: 'lets a wide widget inflate the shared column by default', exclude: false, expected: [[5, 14], [1, 1]] },
        { name: 'drops an excluded widget and the rest of its line', exclude: true, expected: [[5], [1, 1]] }
    ])('$name', ({ exclude, expected }) => {
        const lines = [
            [pre('short'), pre('VERYLONGWIDGET', exclude ? { excludeFromAutoAlign: true } : {})],
            [pre('x'), pre('y')]
        ];

        expect(calculateMaxWidthsFromPreRendered(lines, createSettings())).toEqual(expected);
    });

    it('keeps columns before the excluded widget aligned', () => {
        const lines = [
            [pre('a'), pre('wide', { excludeFromAutoAlign: true }), pre('tail')],
            [pre('AAAAA'), pre('BBBBB'), pre('CCCCC')]
        ];

        expect(calculateMaxWidthsFromPreRendered(lines, createSettings())).toEqual([[1], [5, 5, 5]]);
    });

    it('ignores exclusions on widgets merged into a previous widget', () => {
        const linesWithoutExclude = [
            [pre('a', { merge: true }), pre('VERYLONGWIDGET')],
            [pre('x'), pre('y')]
        ];
        const linesWithMergedExclude = [
            [pre('a', { merge: true }), pre('VERYLONGWIDGET', { excludeFromAutoAlign: true })],
            [pre('x'), pre('y')]
        ];

        expect(calculateMaxWidthsFromPreRendered(linesWithMergedExclude, createSettings()))
            .toEqual(calculateMaxWidthsFromPreRendered(linesWithoutExclude, createSettings()));
    });

    it('honors exclusions on the first widget in a merged chain', () => {
        const lines = [
            [pre('a', { merge: true, excludeFromAutoAlign: true }), pre('VERYLONGWIDGET')],
            [pre('x'), pre('y')]
        ];

        expect(calculateMaxWidthsFromPreRendered(lines, createSettings())).toEqual([[], [1, 1]]);
    });
});

describe('renderStatusLine auto-align exemption', () => {
    // Per-line max widths: each line computes independent widths. Auto-alignment
    // within a line is controlled by excludeFromAutoAlign, which stops column
    // computation for the rest of that line.
    const settings = createSettings({ powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, autoAlign: true } });

    it('computes independent max widths per line (no cross-line sharing)', () => {
        const lines = [
            [text('a'), text('b')],
            [text('AAAAA'), text('BBBBB')]
        ];
        const context: RenderContext = { isPreview: false, terminalWidth: 200, lineIndex: 0 };
        const preRendered = preRenderAllWidgets(lines, settings, context);
        const maxWidths = calculateMaxWidthsFromPreRendered(preRendered, settings);
        // Each line independent — line 0 stays narrow, line 1 stays wide
        expect(maxWidths).toEqual([[1, 1], [5, 5]]);
    });

    it('per-line max widths keep each line independent (cross-line sharing removed)', () => {
        // line 0 has 'a' (1), line 1 has 'AAAAA' (5). With per-line widths,
        // line 0 stays at 1 and line 1 stays at 5 — no cross-line inflation.
        const lines = [
            [text('a')],
            [text('AAAAA')]
        ];
        const context: RenderContext = { isPreview: false, terminalWidth: 200, lineIndex: 0 };
        const preRendered = preRenderAllWidgets(lines, settings, context);
        const maxWidths = calculateMaxWidthsFromPreRendered(preRendered, settings);
        expect(maxWidths).toEqual([[1], [5]]);
    });

    it('excludeFromAutoAlign works per-line via max widths', () => {
        // On a single line, the exclude flag shortens the computed column list.
        // calulateMaxWidthsFromPreRendered already covers this — verify integration.
        const preRendered = preRenderAllWidgets(
            [[text('a'), text('WIDE', { excludeFromAutoAlign: true }), text('b')]],
            settings,
            { isPreview: false, terminalWidth: 200, lineIndex: 0 }
        );
        const maxWidths = calculateMaxWidthsFromPreRendered(preRendered, settings);
        expect(maxWidths).toEqual([[1]]); // only first column before exclusion
    });

    function renderLines(lines: WidgetItem[][], maxWidths?: number[][]): string[] {
        const context: RenderContext = { isPreview: false, terminalWidth: 200 };
        const preRendered = preRenderAllWidgets(lines, settings, context);
        const widths = maxWidths ?? calculateMaxWidthsFromPreRendered(preRendered, settings);
        return lines.map((line, lineIndex) => renderStatusLine(
            line,
            settings,
            { ...context, lineIndex },
            preRendered[lineIndex] ?? [],
            widths[lineIndex] ?? []
        ));
    }

    it('pads columns after a merged exclusion using each line\'s own widths', () => {
        const [first, second] = renderLines([
            [text('a', { merge: true }), text('b', { excludeFromAutoAlign: true }), text('c')],
            [text('AAAAA'), text('CCCCC')]
        ]);

        // Per-line widths: line 0 stays at its natural 4 columns, the wider
        // line 1 aligns at 11. Cross-line sharing is intentionally gone.
        expect(getVisibleWidth(first ?? '')).toBe(4);
        expect(getVisibleWidth(second ?? '')).toBe(11);
    });

    it('leaves a merged line at its natural widths when no column widths were worked out', () => {
        const line = [text('a', { merge: true }), text('b'), text('c')];
        const unaligned = renderStatusLine(
            line,
            createSettings({ powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true } }),
            { isPreview: false, terminalWidth: 200, lineIndex: 0 },
            preRenderAllWidgets([line], settings, { isPreview: false, terminalWidth: 200 })[0] ?? [],
            []
        );

        expect(renderLines([line], [])[0]).toBe(unaligned);
    });
});
