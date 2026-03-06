import {
    describe,
    expect,
    it
} from 'vitest';

import {
    buildTerminalOptionsItems,
    getNextColorLevel,
    shouldWarnOnColorLevelChange
} from '../TerminalOptionsMenu';

describe('TerminalOptionsMenu helpers', () => {
    it('cycles color levels in order', () => {
        expect(getNextColorLevel(0)).toBe(1);
        expect(getNextColorLevel(1)).toBe(2);
        expect(getNextColorLevel(2)).toBe(3);
        expect(getNextColorLevel(3)).toBe(0);
    });

    it('warns only when custom colors would be lost', () => {
        expect(shouldWarnOnColorLevelChange(2, 3, true)).toBe(true);
        expect(shouldWarnOnColorLevelChange(3, 0, true)).toBe(true);
        expect(shouldWarnOnColorLevelChange(2, 2, true)).toBe(false);
        expect(shouldWarnOnColorLevelChange(1, 2, true)).toBe(false);
        expect(shouldWarnOnColorLevelChange(3, 0, false)).toBe(false);
    });

    it('builds terminal options list items with the current color level label', () => {
        const items = buildTerminalOptionsItems(2);

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            label: '◱ Terminal Width',
            value: 'width'
        });
        expect(items[1]).toMatchObject({
            label: '▓ Color Level',
            sublabel: '(256 Color (default))',
            value: 'colorLevel'
        });
        expect(items[1]?.description).toContain('Truecolor');
    });
});