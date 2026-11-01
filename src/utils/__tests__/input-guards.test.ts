import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getPlainInput,
    shouldInsertInput
} from '../input-guards';

describe('getPlainInput', () => {
    it('passes bare keypresses through, shifted ones included', () => {
        expect(getPlainInput('d', {})).toBe('d');
        expect(getPlainInput('D', { shift: true })).toBe('D');
        expect(getPlainInput(' ', {})).toBe(' ');
    });

    it('hides the letter while ctrl or alt/option (meta) is held', () => {
        expect(getPlainInput('d', { ctrl: true })).toBe('');
        expect(getPlainInput('d', { meta: true })).toBe('');
        expect(getPlainInput('d', { ctrl: true, meta: true })).toBe('');
    });
});

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
