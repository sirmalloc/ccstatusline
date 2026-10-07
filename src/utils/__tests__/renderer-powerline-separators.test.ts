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
import {
    calculateMaxWidthsFromPreRendered,
    renderStatusLine,
    type PreRenderedWidget
} from '../renderer';

// Hex colors produce raw truecolor codes, so expected strings do not depend
// on chalk's ambient color-support detection.
const A_FG = 'hex:AABBCC';
const A_BG = 'hex:112233';
const B_FG = 'hex:DDEEFF';
const B_BG = 'hex:445566';

const A_FG_CODE = '\x1b[38;2;170;187;204m';
const A_BG_CODE = '\x1b[48;2;17;34;51m';
const A_BG_AS_FG_CODE = '\x1b[38;2;17;34;51m';
const B_FG_CODE = '\x1b[38;2;221;238;255m';
const B_BG_CODE = '\x1b[48;2;68;85;102m';
const B_BG_AS_FG_CODE = '\x1b[38;2;68;85;102m';

const A_BACKGROUND = { color: A_BG, code: A_BG_CODE };
const B_BACKGROUND = { color: B_BG, code: B_BG_CODE };
const NO_BACKGROUND = { color: undefined, code: '' };

const BOLD = '\x1b[1m';
const INTENSITY_RESET = '\x1b[22m';
// Emitted after each Powerline widget's text.
const COLOR_RESET = '\x1b[49m\x1b[39m';

type PowerlineOverrides = Partial<Settings['powerline']>;

function text(id: string, extra: Partial<WidgetItem> = {}): WidgetItem {
    return { id, type: 'custom-text', ...extra };
}

const FLEX: WidgetItem = { id: 'flex', type: 'flex-separator' };

function powerlineSettings(powerline: PowerlineOverrides = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        colorLevel: 3,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            enabled: true,
            separators: ['>'],
            separatorInvertBackground: [false],
            ...powerline
        }
    };
}

function preRender(widgets: WidgetItem[], contentByIndex: Record<number, string>): PreRenderedWidget[] {
    return widgets.map((widget, i) => {
        const content = contentByIndex[i] ?? '';
        return { content, plainLength: content.length, widget };
    });
}

// terminalWidth 0 means "width unknown": no truncation, and each flex
// separator collapses to a single space.
function render(
    widgets: WidgetItem[],
    contentByIndex: Record<number, string>,
    powerline: PowerlineOverrides = {},
    maxWidths: number[] = []
): string {
    const context: RenderContext = { isPreview: false, terminalWidth: 0 };
    return renderStatusLine(widgets, powerlineSettings(powerline), context, preRender(widgets, contentByIndex), maxWidths);
}

describe('powerline separator colors', () => {
    it.each([
        {
            name: 'different backgrounds',
            invert: false,
            aBg: A_BACKGROUND,
            bBg: B_BACKGROUND,
            separator: `${A_BG_AS_FG_CODE}${B_BG_CODE}>\x1b[39m\x1b[49m`
        },
        {
            name: 'the same background (arrow takes the left widget\'s text color)',
            invert: false,
            aBg: A_BACKGROUND,
            bBg: A_BACKGROUND,
            separator: `${A_FG_CODE}${A_BG_CODE}>\x1b[39m\x1b[49m`
        },
        {
            name: 'only the left widget has a background',
            invert: false,
            aBg: A_BACKGROUND,
            bBg: NO_BACKGROUND,
            separator: `${A_BG_AS_FG_CODE}>\x1b[39m`
        },
        {
            name: 'only the right widget has a background',
            invert: false,
            aBg: NO_BACKGROUND,
            bBg: B_BACKGROUND,
            separator: `${B_BG_AS_FG_CODE}>\x1b[39m`
        },
        {
            name: 'no backgrounds',
            invert: false,
            aBg: NO_BACKGROUND,
            bBg: NO_BACKGROUND,
            separator: '>'
        },
        {
            name: 'different backgrounds, inverted',
            invert: true,
            aBg: A_BACKGROUND,
            bBg: B_BACKGROUND,
            separator: `${B_BG_AS_FG_CODE}${A_BG_CODE}>\x1b[39m\x1b[49m`
        },
        {
            name: 'the same background, inverted (arrow takes the right widget\'s text color)',
            invert: true,
            aBg: A_BACKGROUND,
            bBg: A_BACKGROUND,
            separator: `${B_FG_CODE}${A_BG_CODE}>\x1b[39m\x1b[49m`
        },
        {
            name: 'only the left widget has a background, inverted',
            invert: true,
            aBg: A_BACKGROUND,
            bBg: NO_BACKGROUND,
            separator: `${A_BG_AS_FG_CODE}>\x1b[39m`
        },
        {
            name: 'only the right widget has a background, inverted',
            invert: true,
            aBg: NO_BACKGROUND,
            bBg: B_BACKGROUND,
            separator: `${B_BG_AS_FG_CODE}>\x1b[39m`
        },
        {
            name: 'no backgrounds, inverted',
            invert: true,
            aBg: NO_BACKGROUND,
            bBg: NO_BACKGROUND,
            separator: '>'
        }
    ])('colors the arrow between widgets with $name', ({ invert, aBg, bBg, separator }) => {
        const widgets = [
            text('a', { color: A_FG, backgroundColor: aBg.color }),
            text('b', { color: B_FG, backgroundColor: bBg.color })
        ];

        const line = render(widgets, { 0: 'A', 1: 'B' }, { separatorInvertBackground: [invert] });

        expect(line).toBe(
            `${A_FG_CODE}${aBg.code}A${COLOR_RESET}`
            + separator
            + `${B_FG_CODE}${bBg.code}B${COLOR_RESET}`
        );
    });
});

describe('powerline caps on widgets without a background', () => {
    it('emits start, flex-boundary and end caps uncolored', () => {
        const widgets = [text('a', { color: A_FG }), FLEX, text('b', { color: B_FG })];

        const line = render(widgets, { 0: 'A', 2: 'B' }, { startCaps: ['['], endCaps: [']'] });

        expect(line).toBe(`[${A_FG_CODE}A${COLOR_RESET}] [${B_FG_CODE}B${COLOR_RESET}]`);
    });
});

describe('powerline bold resets at segment boundaries', () => {
    it('ends bold before a flex gap so it cannot leak into the next segment', () => {
        const widgets = [text('a', { color: A_FG, bold: true }), FLEX, text('b', { color: B_FG })];

        const line = render(widgets, { 0: 'A', 2: 'B' });

        expect(line).toBe(`${BOLD}${A_FG_CODE}A${COLOR_RESET}${INTENSITY_RESET} ${B_FG_CODE}B${COLOR_RESET}`);
    });

    it('keeps the end cap bold, then ends bold after it', () => {
        const line = render([text('a', { color: A_FG, bold: true })], { 0: 'A' }, { endCaps: [']'] });

        expect(line).toBe(`${BOLD}${A_FG_CODE}A${COLOR_RESET}]${INTENSITY_RESET}`);
    });
});

describe('powerline widgets that preserve their own colors', () => {
    it('keeps the command\'s colors, applies the background, and fully resets after', () => {
        const widgets: WidgetItem[] = [{
            id: 'cmd',
            type: 'custom-command',
            preserveColors: true,
            color: B_FG,
            backgroundColor: A_BG
        }];

        const line = render(widgets, { 0: '\x1b[31mred\x1b[39m' });

        expect(line).toBe(`${A_BG_CODE}\x1b[31mred\x1b[39m\x1b[0m`);
    });
});

describe('powerline merged widgets', () => {
    it('pads a merged group as a unit, after its last widget, when auto-aligning', () => {
        const line1 = [text('a', { color: A_FG, merge: true }), text('b', { color: B_FG }), text('c', { color: A_FG })];
        const line2 = [text('wide', { color: A_FG }), text('d', { color: B_FG })];
        const settings = powerlineSettings({ autoAlign: true });
        const maxWidths = calculateMaxWidthsFromPreRendered([
            preRender(line1, { 0: 'A', 1: 'B', 2: 'C' }),
            preRender(line2, { 0: 'WIDE5', 1: 'D' })
        ], settings);

        expect(maxWidths).toEqual([5, 1]);

        const line = render(line1, { 0: 'A', 1: 'B', 2: 'C' }, { autoAlign: true }, maxWidths);

        expect(line).toBe(
            `${A_FG_CODE}A${COLOR_RESET}`
            + `${B_FG_CODE}B   ${COLOR_RESET}`
            + '>'
            + `${A_FG_CODE}C${COLOR_RESET}`
        );
    });

    it('merges across a widget that rendered empty', () => {
        const widgets = [text('a', { color: A_FG, merge: true }), text('empty'), text('b', { color: B_FG })];
        const contents = { 0: 'A', 2: 'B' };

        expect(calculateMaxWidthsFromPreRendered([preRender(widgets, contents)], powerlineSettings())).toEqual([2]);
        expect(render(widgets, contents)).toBe(`${A_FG_CODE}A${COLOR_RESET}${B_FG_CODE}B${COLOR_RESET}`);
    });

    it('keeps the trailing padding of a no-padding merge when nothing after it rendered', () => {
        const widgets = [text('a', { color: A_FG, merge: 'no-padding' }), text('empty')];
        const settings = { ...powerlineSettings(), defaultPadding: ' ' };
        const context: RenderContext = { isPreview: false, terminalWidth: 0 };
        const preRendered = preRender(widgets, { 0: 'A' });

        expect(calculateMaxWidthsFromPreRendered([preRendered], settings)).toEqual([3]);
        expect(renderStatusLine(widgets, settings, context, preRendered, [])).toBe(`${A_FG_CODE} A ${COLOR_RESET}`);
    });
});
