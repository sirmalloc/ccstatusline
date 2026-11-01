import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getVisibleText,
    getVisibleWidth
} from '../ansi';

describe('getVisibleWidth', () => {
    it('counts printable ASCII one column per character', () => {
        expect(getVisibleWidth('hello world')).toBe(11);
        expect(getVisibleWidth(' ~'.repeat(200))).toBe(400);
    });

    it('keeps ASCII characters clustered with a following extender', () => {
        expect(getVisibleWidth('é')).toBe(1);
        expect(getVisibleWidth('café ok')).toBe(7);
        expect(getVisibleWidth('a‍')).toBe(1);
        expect(getVisibleWidth('#️⃣')).toBe(2);
        expect(getVisibleWidth('1⃣')).toBe(2);
        expect(getVisibleWidth('a\u{1F3FB}')).toBe(2);
    });

    it('gives ASCII control characters no width', () => {
        expect(getVisibleWidth('a\tb')).toBe(2);
        expect(getVisibleWidth('a\x7fb')).toBe(2);
    });

    it('measures non-ASCII text next to ASCII', () => {
        expect(getVisibleWidth(' x')).toBe(2);
        expect(getVisibleWidth('中a')).toBe(3);
        expect(getVisibleWidth(' main')).toBe(6);
        expect(getVisibleWidth('❤️')).toBe(2);
    });

    it('joins clusters split by escape sequences before measuring', () => {
        expect(getVisibleWidth('e\x1b[31ḿ')).toBe(1);
    });

    it('returns the same width when a cluster is measured repeatedly', () => {
        for (let i = 0; i < 3; i++) {
            expect(getVisibleWidth('⚠ 中 ⚠️ 🇺🇸')).toBe(10);
        }
    });
});

describe('getVisibleText', () => {
    it('drops 7-bit and C1 escape sequences between visible runs', () => {
        expect(getVisibleText('e\x1b[31ḿ')).toBe('é');
        expect(getVisibleText('x\x9b31my')).toBe('xy');
        expect(getVisibleText('ab\x9d8;;https://x.test\x9ccd\x9d8;;\x9c')).toBe('abcd');
        expect(getVisibleText('\x1b]8;;https://x.test\x07link\x1b]8;;\x07 tail\x1b')).toBe('link tail');
    });
});
