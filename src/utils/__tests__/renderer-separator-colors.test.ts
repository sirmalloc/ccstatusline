import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
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
import { updateColorMap } from '../colors';
import {
    renderStatusLine,
    type PreRenderedWidget
} from '../renderer';

const A_FG = 'hex:AABBCC';
const A_BG = 'hex:112233';
const B_FG = 'hex:DDEEFF';

const A_FG_CODE = '\x1b[38;2;170;187;204m';
const A_BG_CODE = '\x1b[48;2;17;34;51m';
const B_FG_CODE = '\x1b[38;2;221;238;255m';
// Custom Text's default color, 'white', at truecolor (#d3d7cf).
const WHITE_CODE = '\x1b[38;2;211;215;207m';

const BOLD = '\x1b[1m';
const FG_RESET = '\x1b[39m';
const BG_RESET = '\x1b[49m';
const INTENSITY_RESET = '\x1b[22m';

const SEP: WidgetItem = { id: 'sep', type: 'separator' };

function text(id: string, extra: Partial<WidgetItem> = {}): WidgetItem {
    return { id, type: 'custom-text', ...extra };
}

function render(
    widgets: WidgetItem[],
    contentByIndex: Record<number, string>,
    overrides: Partial<Settings> = {}
): string {
    const settings: Settings = { ...DEFAULT_SETTINGS, colorLevel: 3, ...overrides };
    const context: RenderContext = { isPreview: false, terminalWidth: 200 };
    const preRenderedWidgets: PreRenderedWidget[] = widgets.map((widget, i) => {
        const content = contentByIndex[i] ?? '';
        return { content, plainLength: content.length, widget };
    });
    return renderStatusLine(widgets, settings, context, preRenderedWidgets, []);
}

describe('separator colors in standard mode', () => {
    // Named colors (a widget's default color) go through chalk, so pin its
    // level to keep the expected codes independent of the environment.
    const originalLevel = chalk.level;

    beforeEach(() => {
        chalk.level = 3;
        updateColorMap();
    });

    afterEach(() => {
        chalk.level = originalLevel;
        updateColorMap();
    });

    describe('separator widgets with inheritSeparatorColors', () => {
        it('take the color, background and bold of the widget before them', () => {
            const widgets = [text('a', { color: A_FG, backgroundColor: A_BG, bold: true }), SEP, text('b', { color: B_FG })];

            const line = render(widgets, { 0: 'A', 2: 'B' }, { inheritSeparatorColors: true });

            expect(line).toBe(
                `${BOLD}${A_BG_CODE}${A_FG_CODE}A${FG_RESET}${BG_RESET}${INTENSITY_RESET}`
                + `${BOLD}${A_BG_CODE}${A_FG_CODE} | ${FG_RESET}${BG_RESET}${INTENSITY_RESET}`
                + `${B_FG_CODE}B${FG_RESET}`
            );
        });

        it('fall back to the previous widget\'s default color when it has none', () => {
            const widgets = [text('a'), SEP, text('b', { color: B_FG })];

            const line = render(widgets, { 0: 'A', 2: 'B' }, { inheritSeparatorColors: true });

            expect(line).toBe(
                `${WHITE_CODE}A${FG_RESET}`
                + `${WHITE_CODE} | ${FG_RESET}`
                + `${B_FG_CODE}B${FG_RESET}`
            );
        });
    });

    describe('the automatic defaultSeparator', () => {
        it('takes each previous widget\'s colors with inheritSeparatorColors, including default colors', () => {
            const widgets = [text('a', { color: A_FG, backgroundColor: A_BG }), text('b'), text('c', { color: B_FG })];

            const line = render(widgets, { 0: 'A', 1: 'B', 2: 'C' }, {
                defaultSeparator: '|',
                inheritSeparatorColors: true
            });

            expect(line).toBe(
                `${A_BG_CODE}${A_FG_CODE}A${FG_RESET}${BG_RESET}`
                + `${A_BG_CODE}${A_FG_CODE} | ${FG_RESET}${BG_RESET}`
                + `${WHITE_CODE}B${FG_RESET}`
                + `${WHITE_CODE} | ${FG_RESET}`
                + `${B_FG_CODE}C${FG_RESET}`
            );
        });

        it('takes the global background override when not inheriting', () => {
            const widgets = [text('a', { color: A_FG }), text('b', { color: B_FG })];

            const line = render(widgets, { 0: 'A', 1: 'B' }, {
                defaultSeparator: '|',
                overrideBackgroundColor: A_BG
            });

            expect(line).toBe(
                `${A_BG_CODE}${A_FG_CODE}A${FG_RESET}${BG_RESET}`
                + `${A_BG_CODE} | ${BG_RESET}`
                + `${A_BG_CODE}${B_FG_CODE}B${FG_RESET}${BG_RESET}`
            );
        });

        it.each([
            { separator: ',', expected: 'A, B' },
            { separator: '-', expected: 'A - B' }
        ])('spaces a "$separator" separator as "$expected"', ({ separator, expected }) => {
            const line = render([text('a'), text('b')], { 0: 'A', 1: 'B' }, { defaultSeparator: separator });

            expect(stripSgrCodes(line)).toBe(expected);
        });
    });
});
