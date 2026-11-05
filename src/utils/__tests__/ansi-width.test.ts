import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getVisibleText,
    getVisibleWidth,
    replaceSpacesForOutput
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

describe('replaceSpacesForOutput', () => {
    it('uses a non-breaking space for ordinary spaces', () => {
        expect(replaceSpacesForOutput('a b  c')).toBe('a\u00A0b\u00A0\u00A0c');
    });

    it('uses an en space after a Private Use Area icon', () => {
        expect(replaceSpacesForOutput('\uF167 Opus')).toBe('\uF167\u2002Opus');
        expect(replaceSpacesForOutput('\u{F167A} Opus')).toBe('\u{F167A}\u2002Opus');
        expect(replaceSpacesForOutput('\u{10FFFD} x')).toBe('\u{10FFFD}\u2002x');
    });

    it('sees through color codes and link closers between the icon and the space', () => {
        expect(replaceSpacesForOutput('\x1b[36m\uF167\x1b[39m\x1b[0m x')).toBe('\x1b[36m\uF167\x1b[39m\x1b[0m\u2002x');
        expect(replaceSpacesForOutput('\uF167\x1b]8;;\x07 x')).toBe('\uF167\x1b]8;;\x07\u2002x');
        expect(replaceSpacesForOutput('\x1b[36mA\x1b[39m x')).toBe('\x1b[36mA\x1b[39m\u00A0x');
    });

    it('leaves spaces after Powerline separators alone', () => {
        expect(replaceSpacesForOutput('\uE0B0 x')).toBe('\uE0B0\u00A0x');
        expect(replaceSpacesForOutput('\uE0C0 x')).toBe('\uE0C0\u00A0x');
    });

    it('only changes the first space after the icon', () => {
        expect(replaceSpacesForOutput('\uF167  a b')).toBe('\uF167\u2002\u00A0a\u00A0b');
    });

    it('keeps the display width of the text it replaces', () => {
        const text = '\uF167 Opus \u{F167A} 4.5 | x';
        expect(getVisibleWidth(replaceSpacesForOutput(text))).toBe(getVisibleWidth(text.replace(/ /g, '\u00A0')));
    });
});
