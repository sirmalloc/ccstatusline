import {
    describe,
    expect,
    it
} from 'vitest';

import { shouldInsertInput } from '../input-guards';

describe('shouldInsertInput', () => {
    it('allows regular printable input without modifiers', () => {
        expect(shouldInsertInput('s', {})).toBe(true);
        expect(shouldInsertInput('S', { shift: true })).toBe(true);
    });

    it('blocks ctrl chords', () => {
        expect(shouldInsertInput('s', { ctrl: true })).toBe(false);
    });

    it('blocks meta chords', () => {
        expect(shouldInsertInput('s', { meta: true })).toBe(false);
    });

    it('blocks tab-based input', () => {
        expect(shouldInsertInput('\t', { tab: true })).toBe(false);
    });

    it('blocks control characters and allows unicode text', () => {
        expect(shouldInsertInput('\u0013', {})).toBe(false);
        expect(shouldInsertInput('🙂', {})).toBe(true);
    });
});