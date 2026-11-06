import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    cycleBracketStyle,
    formatThinkingEffort,
    getBracketColorMode,
    getBracketStyle,
    getLevelColor,
    isLevelColorsEnabled,
    resetLevelColors,
    setBracketColorMode,
    setLevelColor,
    setLevelColorsEnabled
} from '../effort-style';

const base: WidgetItem = { id: 'e', type: 'thinking-effort' };
const ORANGE = '\x1b[38;5;208m';
const FG_RESET = '\x1b[39m';

function withMetadata(metadata: Record<string, string>, overrides: Partial<WidgetItem> = {}): WidgetItem {
    return { ...base, ...overrides, metadata };
}

describe('bracket style', () => {
    it('is off by default', () => {
        expect(getBracketStyle(base)).toBeNull();
    });

    it('cycles off, (), [], {}, <> and back to off without leaving metadata behind', () => {
        const seen: (string | null)[] = [];
        let item = base;
        for (let i = 0; i < 5; i++) {
            item = cycleBracketStyle(item);
            seen.push(getBracketStyle(item));
        }

        expect(seen).toEqual(['()', '[]', '{}', '<>', null]);
        expect(item.metadata).toBeUndefined();
    });
});

describe('level colors', () => {
    it('are off by default and store nothing when turned back off', () => {
        expect(isLevelColorsEnabled(base)).toBe(false);

        const enabled = setLevelColorsEnabled(base, true);
        expect(isLevelColorsEnabled(enabled)).toBe(true);
        expect(setLevelColorsEnabled(enabled, false).metadata).toBeUndefined();
    });

    it('defaults to a cold-to-hot palette', () => {
        expect(getLevelColor(base, 'low', 'ansi256')).toBe('brightBlack');
        expect(getLevelColor(base, 'medium', 'ansi256')).toBe('green');
        expect(getLevelColor(base, 'high', 'ansi256')).toBe('yellow');
        expect(getLevelColor(base, 'xhigh', 'ansi256')).toBe('ansi256:208');
        expect(getLevelColor(base, 'max', 'ansi256')).toBe('red');
    });

    it('swaps the default orange for a basic color on 16-color terminals', () => {
        expect(getLevelColor(base, 'xhigh', 'ansi16')).toBe('brightMagenta');
    });

    it('keeps a color the user chose even on 16-color terminals', () => {
        const item = setLevelColor(base, 'xhigh', 'hex:ff8800');
        expect(getLevelColor(item, 'xhigh', 'ansi16')).toBe('hex:ff8800');
        expect(getLevelColor(item, 'max', 'ansi16')).toBe('red');
    });

    it('resets one level when its color is cleared', () => {
        const item = setLevelColor(setLevelColor(base, 'high', 'blue'), 'high', null);
        expect(getLevelColor(item, 'high', 'ansi256')).toBe('yellow');
        expect(item.metadata).toBeUndefined();
    });

    it('resets every level and the bracket color, but not the on/off switch', () => {
        let item = setLevelColorsEnabled(base, true);
        item = setLevelColor(item, 'low', 'blue');
        item = setLevelColor(item, 'max', 'hex:ff0000');
        item = setBracketColorMode(item, 'widget');

        const reset = resetLevelColors(item);
        expect(getLevelColor(reset, 'low', 'ansi256')).toBe('brightBlack');
        expect(getLevelColor(reset, 'max', 'ansi256')).toBe('red');
        expect(getBracketColorMode(reset)).toBe('effort');
        expect(isLevelColorsEnabled(reset)).toBe(true);
    });

    it('colors brackets like the effort unless set to the widget color', () => {
        expect(getBracketColorMode(base)).toBe('effort');
        expect(getBracketColorMode(setBracketColorMode(base, 'widget'))).toBe('widget');
        expect(setBracketColorMode(setBracketColorMode(base, 'widget'), 'effort').metadata).toBeUndefined();
    });
});

describe('formatThinkingEffort', () => {
    const xhigh = { text: 'xhigh', level: 'xhigh' } as const;
    const plain = { colorLevel: 'ansi256', colorsDisabled: false } as const;

    it('renders the label, or just the value in raw mode, when nothing is customized', () => {
        expect(formatThinkingEffort(base, xhigh, plain)).toBe('Thinking: xhigh');
        expect(formatThinkingEffort({ ...base, rawValue: true }, xhigh, plain)).toBe('xhigh');
    });

    it('wraps the whole output in the chosen brackets', () => {
        expect(formatThinkingEffort(withMetadata({ brackets: '()' }, { rawValue: true }), xhigh, plain)).toBe('(xhigh)');
        expect(formatThinkingEffort(withMetadata({ brackets: '<>' }, { rawValue: true }), xhigh, plain)).toBe('<xhigh>');
        expect(formatThinkingEffort(withMetadata({ brackets: '[]' }), xhigh, plain)).toBe('[Thinking: xhigh]');
    });

    // The renderer colors the rest with the widget color (Widget.colorsOnlyItsRuns)
    it('colors the value and matching brackets by level, and leaves the label uncolored', () => {
        const item = withMetadata({ brackets: '()', levelColors: 'true' });

        expect(formatThinkingEffort(item, xhigh, plain)).toBe(
            `${ORANGE}(${FG_RESET}Thinking: ${ORANGE}xhigh${FG_RESET}${ORANGE})${FG_RESET}`
        );
    });

    it('leaves brackets uncolored when they take the widget color', () => {
        const item = withMetadata({ brackets: '()', levelColors: 'true', bracketColor: 'widget' }, { rawValue: true });

        expect(formatThinkingEffort(item, xhigh, plain)).toBe(`(${ORANGE}xhigh${FG_RESET})`);
    });

    it('leaves levels it does not know uncolored', () => {
        const item = withMetadata({ levelColors: 'true', brackets: '()' }, { rawValue: true });

        expect(formatThinkingEffort(item, { text: 'super-max?', level: null }, plain)).toBe('(super-max?)');
    });

    it('emits plain text when colors are disabled', () => {
        const item = withMetadata({ brackets: '()', levelColors: 'true' }, { rawValue: true });

        expect(formatThinkingEffort(item, xhigh, { ...plain, colorsDisabled: true })).toBe('(xhigh)');
    });
});
