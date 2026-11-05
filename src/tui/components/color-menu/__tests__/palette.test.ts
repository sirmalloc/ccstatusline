import chalk from 'chalk';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { updateColorMap } from '../../../../utils/colors';
import {
    PALETTE_ROW_COUNT,
    colorToPaletteIndex,
    getPaletteHex,
    getPaletteLabel,
    getPaletteMarkerColor,
    getPalettePosition,
    getPaletteRow,
    movePaletteIndex,
    paletteIndexToColor
} from '../palette';

function allRows(): number[][] {
    return Array.from({ length: PALETTE_ROW_COUNT }, (_, row) => getPaletteRow(row));
}

describe('palette layout', () => {
    it('puts the 16 basic colors first and the 24 grays last', () => {
        expect(getPaletteRow(0)).toEqual(Array.from({ length: 16 }, (_, i) => i));
        expect(getPaletteRow(PALETTE_ROW_COUNT - 1)).toEqual(Array.from({ length: 24 }, (_, i) => 232 + i));
    });

    it('lays the color cube out as six 6x6 blocks side by side, one per red level', () => {
        const firstCubeRow = getPaletteRow(1);
        expect(firstCubeRow).toHaveLength(36);
        // Blue runs across a block, then the next block starts at the next red level
        expect(firstCubeRow.slice(0, 7)).toEqual([16, 17, 18, 19, 20, 21, 52]);
        // Green runs down the rows
        expect(getPaletteRow(2)[0]).toBe(22);
        expect(getPaletteRow(6).at(-1)).toBe(231);
    });

    it('places every color exactly once, at the position it reports', () => {
        const placed = allRows().flat();
        expect([...placed].sort((a, b) => a - b)).toEqual(Array.from({ length: 256 }, (_, i) => i));

        for (let index = 0; index < 256; index++) {
            const { row, column } = getPalettePosition(index);
            expect(getPaletteRow(row)[column]).toBe(index);
        }
    });
});

describe('movePaletteIndex', () => {
    it('wraps left and right within a row', () => {
        expect(movePaletteIndex(0, 'left')).toBe(15);
        expect(movePaletteIndex(15, 'right')).toBe(0);
        expect(movePaletteIndex(21, 'right')).toBe(52);
    });

    it('keeps the column between rows of the same length', () => {
        expect(movePaletteIndex(16, 'down')).toBe(22);
        expect(movePaletteIndex(22, 'up')).toBe(16);
    });

    it('keeps the ends of rows lined up between rows of different lengths', () => {
        expect(movePaletteIndex(0, 'down')).toBe(16);
        expect(movePaletteIndex(15, 'down')).toBe(201);
        expect(movePaletteIndex(201, 'up')).toBe(15);
        expect(movePaletteIndex(231, 'down')).toBe(255);
    });

    it('returns to the same column after moving down and back up', () => {
        for (const index of getPaletteRow(0)) {
            expect(movePaletteIndex(movePaletteIndex(index, 'down'), 'up')).toBe(index);
        }
    });

    it('wraps between the first and last rows', () => {
        expect(movePaletteIndex(0, 'up')).toBe(232);
        expect(movePaletteIndex(255, 'down')).toBe(15);
    });
});

describe('palette colors', () => {
    it('gives the standard xterm values for the cube and the grays', () => {
        expect(getPaletteHex(16)).toBe('000000');
        expect(getPaletteHex(208)).toBe('FF8700');
        expect(getPaletteHex(231)).toBe('FFFFFF');
        expect(getPaletteHex(232)).toBe('080808');
        expect(getPaletteHex(255)).toBe('EEEEEE');
    });

    it('labels basic colors by name and the rest by hex value', () => {
        expect(getPaletteLabel(9)).toBe('ANSI 9  Bright Red');
        expect(getPaletteLabel(208)).toBe('ANSI 208  #FF8700');
    });

    it('marks light colors in black and dark colors in white', () => {
        expect(getPaletteMarkerColor(231)).toBe('black');
        expect(getPaletteMarkerColor(226)).toBe('black');
        expect(getPaletteMarkerColor(16)).toBe('white');
        expect(getPaletteMarkerColor(21)).toBe('white');
    });
});

describe('palette colors in settings', () => {
    // Named colors resolve through chalk, which tests run with colors off
    const originalLevel = chalk.level;

    beforeEach(() => {
        chalk.level = 3;
        updateColorMap();
    });

    afterEach(() => {
        chalk.level = originalLevel;
        updateColorMap();
    });

    it('saves every color as its ansi256 value, the color its swatch shows', () => {
        expect(paletteIndexToColor(1)).toBe('ansi256:1');
        expect(paletteIndexToColor(15)).toBe('ansi256:15');
        expect(paletteIndexToColor(208)).toBe('ansi256:208');
    });

    it('starts ansi256 colors on themselves and hex colors on the nearest cube or gray color', () => {
        for (const level of ['ansi256', 'truecolor'] as const) {
            expect(colorToPaletteIndex('ansi256:1', level)).toBe(1);
            expect(colorToPaletteIndex('ansi256:208', level)).toBe(208);
            expect(colorToPaletteIndex('hex:FF8800', level)).toBe(208);
            expect(colorToPaletteIndex('hex:7f7f7f', level)).toBe(244);
        }
    });

    it('starts named colors on the palette color they are drawn with at the level', () => {
        // At 256 colors, the fixed palette color each name uses
        expect(colorToPaletteIndex('red', 'ansi256')).toBe(160);
        expect(colorToPaletteIndex('bgBrightBlack', 'ansi256')).toBe(59);
        expect(colorToPaletteIndex('white', 'ansi256')).toBe(188);
        // At truecolor, the nearest to each name's hex value (white is #D3D7CF)
        expect(colorToPaletteIndex('red', 'truecolor')).toBe(160);
        expect(colorToPaletteIndex('white', 'truecolor')).toBe(252);
    });

    it('starts named colors on their basic color when they are not drawn with a palette color', () => {
        chalk.level = 0;
        updateColorMap();
        expect(colorToPaletteIndex('red', 'ansi256')).toBe(1);
        expect(colorToPaletteIndex('bgBrightBlack', 'truecolor')).toBe(8);
    });

    it('starts at the first color when there is no palette color to start from', () => {
        expect(colorToPaletteIndex('', 'ansi256')).toBe(0);
        expect(colorToPaletteIndex('gradient:rainbow', 'truecolor')).toBe(0);
    });
});
