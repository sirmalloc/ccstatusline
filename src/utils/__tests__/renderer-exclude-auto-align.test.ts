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
        flexMode: 'full',
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
        { name: 'lets a wide widget inflate the shared column by default', exclude: false, expected: [5, 14] },
        { name: 'drops an excluded widget and the rest of its line', exclude: true, expected: [5, 1] }
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

        expect(calculateMaxWidthsFromPreRendered(lines, createSettings())).toEqual([5, 5, 5]);
    });
});

describe('renderStatusLine auto-align exemption', () => {
    const settings = createSettings({ powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, autoAlign: true } });

    function renderFirstLine(exclude: boolean): string {
        const lines = [
            [text('a'), text('y', exclude ? { excludeFromAutoAlign: true } : {}), text('z')],
            [text('AAAAA'), text('BBBBB'), text('CCCCC')]
        ];
        const context: RenderContext = { isPreview: false, terminalWidth: 200, lineIndex: 0 };
        const preRendered = preRenderAllWidgets(lines, settings, context);
        const maxWidths = calculateMaxWidthsFromPreRendered(preRendered, settings);
        return renderStatusLine(lines[0] ?? [], settings, context, preRendered[0] ?? [], maxWidths);
    }

    it('exempts the excluded widget and the rest of its line from alignment padding', () => {
        expect(getVisibleWidth(renderFirstLine(false))).toBeGreaterThan(getVisibleWidth(renderFirstLine(true)));
    });
});
