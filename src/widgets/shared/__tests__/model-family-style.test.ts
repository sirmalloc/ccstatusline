import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    formatModelName,
    getFamilyColor,
    getModelFamily,
    isFamilyColorsEnabled,
    resetFamilyColors,
    setFamilyColor,
    setFamilyColorsEnabled
} from '../model-family-style';

const base: WidgetItem = { id: 'm', type: 'model' };
const ORANGE = '\x1b[38;2;255;136;0m';
const FG_RESET = '\x1b[39m';

// Family colors on, Opus set to a custom orange so the escape codes don't
// depend on the terminal's color support (named colors go through chalk)
const orangeOpus: WidgetItem = { ...base, metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff8800' } };
const options = { colorLevel: 'truecolor', colorsDisabled: false } as const;

describe('getModelFamily', () => {
    it.each([
        ['Opus 5.5', undefined, 'opus'],
        ['Claude Sonnet 4.5', undefined, 'sonnet'],
        [undefined, 'claude-haiku-4-5-20251001', 'haiku'],
        ['FABLE 5.1', undefined, 'fable'],
        ['Claude', 'claude-opus-5-5', 'opus']
    ])('finds the family of %j / %j', (displayName, id, expected) => {
        expect(getModelFamily(displayName, id)).toBe(expected);
    });

    it('has no family for other models', () => {
        expect(getModelFamily('GPT-5', 'gpt-5')).toBeNull();
        expect(getModelFamily(undefined, undefined)).toBeNull();
    });
});

describe('family colors', () => {
    it('defaults to basic named colors that follow the terminal theme', () => {
        expect(getFamilyColor(base, 'opus')).toBe('magenta');
        expect(getFamilyColor(base, 'sonnet')).toBe('cyan');
        expect(getFamilyColor(base, 'haiku')).toBe('green');
        expect(getFamilyColor(base, 'fable')).toBe('red');
    });

    it('stores only what differs from the defaults', () => {
        expect(isFamilyColorsEnabled(base)).toBe(false);
        expect(setFamilyColorsEnabled(base, true).metadata).toEqual({ familyColors: 'true' });
        expect(setFamilyColorsEnabled(setFamilyColorsEnabled(base, true), false).metadata).toBeUndefined();

        const custom = setFamilyColor(base, 'opus', 'hex:ff8800');
        expect(getFamilyColor(custom, 'opus')).toBe('hex:ff8800');
        expect(custom.metadata).toEqual({ 'familyColor.opus': 'hex:ff8800' });
        expect(setFamilyColor(custom, 'opus', null).metadata).toBeUndefined();
    });

    it('resets the colors to their defaults and keeps the on/off switch', () => {
        const item = setFamilyColor(setFamilyColor(setFamilyColorsEnabled(base, true), 'opus', 'hex:ff8800'), 'fable', 'blue');

        expect(resetFamilyColors(item).metadata).toEqual({ familyColors: 'true' });
    });
});

describe('formatModelName', () => {
    it('renders plain text while family colors are off', () => {
        expect(formatModelName(base, 'Opus 5.5', 'opus', options)).toBe('Model: Opus 5.5');
        expect(formatModelName({ ...base, rawValue: true }, 'Opus 5.5', 'opus', options)).toBe('Opus 5.5');
    });

    // The renderer colors the rest with the widget color (Widget.colorsOnlyItsRuns)
    it('colors the name by family, and leaves the label uncolored', () => {
        expect(formatModelName(orangeOpus, 'Opus 5.5', 'opus', options)).toBe(`Model: ${ORANGE}Opus 5.5${FG_RESET}`);
        expect(formatModelName({ ...orangeOpus, rawValue: true }, 'Opus 5.5', 'opus', options)).toBe(`${ORANGE}Opus 5.5${FG_RESET}`);
    });

    it('leaves a model of no known family uncolored', () => {
        expect(formatModelName(orangeOpus, 'GPT-5', null, options)).toBe('Model: GPT-5');
    });

    it('renders plain text when colors are off for the whole status line', () => {
        expect(formatModelName(orangeOpus, 'Opus 5.5', 'opus', { ...options, colorsDisabled: true })).toBe('Model: Opus 5.5');
    });
});
