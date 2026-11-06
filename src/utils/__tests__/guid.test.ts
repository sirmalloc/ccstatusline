import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { generateGuid } from '../guid';

describe('generateGuid', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('generates a version 4 UUID', () => {
        expect(generateGuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it.each([
        { random: 0, expected: '00000000-0000-4000-8000-000000000000' },
        { random: 0.0625, expected: '11111111-1111-4111-9111-111111111111' },
        { random: 0.5, expected: '88888888-8888-4888-8888-888888888888' },
        // The largest value Math.random() can return
        { random: 1 - Number.EPSILON / 2, expected: 'ffffffff-ffff-4fff-bfff-ffffffffffff' }
    ])('turns Math.random() = $random into $expected', ({ random, expected }) => {
        vi.spyOn(Math, 'random').mockReturnValue(random);

        expect(generateGuid()).toBe(expected);
    });
});
