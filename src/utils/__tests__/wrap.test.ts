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
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';
import { wrapLinesToFit } from '../wrap';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        wrapToFit: true,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function text(id: string, customText: string, extra: Partial<WidgetItem> = {}): WidgetItem {
    return { id, type: 'custom-text', customText, ...extra };
}

function sep(id: string): WidgetItem {
    return { id, type: 'separator' };
}

// Same order as the renderer: available width is the terminal minus 5 columns
function wrap(lines: WidgetItem[][], settings: Settings, terminalWidth: number) {
    const context: RenderContext = { isPreview: false, terminalWidth };
    const preRenderedLines = preRenderAllWidgets(lines, settings, context);
    const result = wrapLinesToFit(lines, preRenderedLines, settings, context);
    const rendered = result?.lines.map((row, i) => renderStatusLine(
        row.widgets,
        settings,
        { ...context, lineIndex: i },
        row.preRendered,
        result.maxWidths
    ));
    return { result, rendered };
}

const powerlineGrid: Partial<Settings> = {
    defaultPadding: ' ',
    powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, autoAlign: true }
};

describe('wrapLinesToFit', () => {
    const line = [
        text('a', 'alpha'), sep('s1'),
        text('b', 'bravo'), sep('s2'),
        text('c', 'charlie'), sep('s3'),
        text('d', 'delta'), sep('s4'),
        text('e', 'echo')
    ];

    it('does nothing when the setting is off', () => {
        expect(wrap([line], createSettings({ wrapToFit: false }), 20).result).toBeNull();
    });

    it('does nothing when every line fits', () => {
        expect(wrap([line], createSettings(), 200).result).toBeNull();
    });

    it('moves widgets onto extra rows instead of truncating', () => {
        const { result, rendered } = wrap([line], createSettings(), 30);

        expect(result).not.toBeNull();
        expect(result?.lines.length).toBeGreaterThan(1);
        for (const row of rendered ?? []) {
            expect(getVisibleWidth(row)).toBeLessThanOrEqual(25);
            expect(row).not.toContain('...');
        }
        // Every widget is still shown, in order
        const ids = result?.lines.flatMap(row => row.widgets.filter(w => w.type !== 'separator').map(w => w.id));
        expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('drops the separator in front of a widget that starts a new row', () => {
        const { result } = wrap([line], createSettings(), 30);

        for (const row of result?.lines.slice(1) ?? []) {
            expect(row.widgets[0]?.type).not.toBe('separator');
            expect(row.continuesLine).toBe(true);
        }
        expect(result?.lines[0]?.continuesLine).toBe(false);
    });

    it('keeps merged widgets on the same row', () => {
        const merged = [
            text('a', 'alpha'), sep('s1'),
            text('b', 'bravo', { merge: true }),
            text('c', 'charlie'), sep('s2'),
            text('d', 'delta')
        ];
        const { result } = wrap([merged], createSettings(), 24);

        const rowOf = (id: string) => result?.lines.findIndex(row => row.widgets.some(w => w.id === id));
        expect(rowOf('b')).toBe(rowOf('c'));
    });

    it('gives every widget the same width with powerline auto-align', () => {
        const lines = [
            [text('a', 'aaaa'), text('b', 'bb'), text('c', 'cccc')],
            [text('d', 'd'), text('e', 'e')]
        ];
        // 15 columns available: 3 cells (20 wide) do not fit, 2 cells do
        const { result, rendered } = wrap(lines, createSettings(powerlineGrid), 20);

        expect(result?.maxWidths).toEqual([6, 6]);
        expect(result?.lines.map(row => row.widgets.map(w => w.id))).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
        for (const row of rendered ?? []) {
            expect(getVisibleWidth(row)).toBeLessThanOrEqual(15);
        }
    });

    it('does not give a slot to widgets that render nothing', () => {
        const lines = [[
            text('a', 'alpha'),
            text('empty', ''),
            text('b', 'bravo'),
            text('c', 'charlie')
        ]];
        const { result } = wrap(lines, createSettings(powerlineGrid), 22);

        // The empty widget rides along with "alpha" instead of taking a cell
        const firstRow = result?.lines[0]?.widgets.map(w => w.id);
        expect(firstRow?.slice(0, 2)).toEqual(['a', 'empty']);
    });

    it('does nothing when the terminal width is unknown', () => {
        const settings = createSettings();
        const context: RenderContext = { isPreview: false, terminalWidth: null };
        const preRenderedLines = preRenderAllWidgets([line], settings, context);
        expect(wrapLinesToFit([line], preRenderedLines, settings, context)).toBeNull();
    });
});
