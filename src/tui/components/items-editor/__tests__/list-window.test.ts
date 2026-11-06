import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getDescriptionRows,
    getListWindow,
    getPickerMaxVisible
} from '../list-window';

describe('getListWindow', () => {
    it('shows the whole list when it fits', () => {
        expect(getListWindow(5, 2, 10)).toEqual({ start: 0, end: 5, hiddenAbove: 0, hiddenBelow: 0 });
    });

    it('shows an empty window for an empty list', () => {
        expect(getListWindow(0, 0, 10)).toEqual({ start: 0, end: 0, hiddenAbove: 0, hiddenBelow: 0 });
    });

    it('starts at the top while the selection is near the top', () => {
        expect(getListWindow(90, 0, 10)).toEqual({ start: 0, end: 10, hiddenAbove: 0, hiddenBelow: 80 });
        expect(getListWindow(90, 4, 10)).toEqual({ start: 0, end: 10, hiddenAbove: 0, hiddenBelow: 80 });
    });

    it('centers the selection in the middle of the list', () => {
        expect(getListWindow(90, 50, 10)).toEqual({ start: 45, end: 55, hiddenAbove: 45, hiddenBelow: 35 });
    });

    it('stops at the bottom when the selection is near the end', () => {
        expect(getListWindow(90, 89, 10)).toEqual({ start: 80, end: 90, hiddenAbove: 80, hiddenBelow: 0 });
    });
});

describe('getPickerMaxVisible', () => {
    it('leaves room for the rest of the picker screen and every status line', () => {
        // The standard 80x24 terminal with a single status line
        expect(getPickerMaxVisible(24, 1)).toBe(7);
        expect(getPickerMaxVisible(24, 3)).toBe(5);
    });

    it('never shows fewer than three entries on a tiny terminal', () => {
        expect(getPickerMaxVisible(12, 1)).toBe(3);
    });

    it('falls back to ten entries when the terminal height is unknown', () => {
        expect(getPickerMaxVisible(undefined, 1)).toBe(10);
    });

    // The highlighted widget's description shows under the list, so a list
    // holding a long one gives up rows for it
    it('gives every description row past the first to the description', () => {
        expect(getPickerMaxVisible(40, 1, 1)).toBe(23);
        expect(getPickerMaxVisible(40, 1, 7)).toBe(17);
        expect(getPickerMaxVisible(24, 1, 7)).toBe(3);
    });
});

describe('getDescriptionRows', () => {
    it('takes a row per line, wrapping long lines at word boundaries', () => {
        expect(getDescriptionRows('Shows the model', 40)).toBe(1);
        expect(getDescriptionRows('First line\nSecond line', 40)).toBe(2);
        expect(getDescriptionRows('aaaa bbbb cccc', 9)).toBe(2);
        expect(getDescriptionRows('aaaa bbbb cccc', 14)).toBe(1);
        expect(getDescriptionRows('aaaa bbbb\ncc', 4)).toBe(3);
    });

    it('breaks a word wider than a row across rows', () => {
        expect(getDescriptionRows('x'.repeat(25), 10)).toBe(3);
        expect(getDescriptionRows(`a ${'x'.repeat(20)}`, 10)).toBe(3);
    });

    it('counts wide characters by the columns they take', () => {
        expect(getDescriptionRows('日本語のテキスト', 8)).toBe(2);
    });

    it('takes a row per line when the width is unknown', () => {
        expect(getDescriptionRows('one\ntwo\nthree', undefined)).toBe(3);
    });
});
