import {
    describe,
    expect,
    it
} from 'vitest';

import { parseCustomColor } from '../custom-color';

describe('parseCustomColor', () => {
    it.each([
        ['#ff8800', 'hex:ff8800'],
        ['FF8800', 'hex:FF8800'],
        ['hex:ff8800', 'hex:ff8800'],
        [' 208 ', 'ansi256:208'],
        ['0', 'ansi256:0'],
        ['ansi256:255', 'ansi256:255']
    ])('accepts %j as %j', (input, expected) => {
        expect(parseCustomColor(input)).toBe(expected);
    });

    it.each(['', 'orange', '#ff88', '#ff88001', '256', 'ansi256:300', '-1', 'hex:zzzzzz'])('rejects %j', (input) => {
        expect(parseCustomColor(input)).toBeNull();
    });
});
