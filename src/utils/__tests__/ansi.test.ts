import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getVisibleText,
    getVisibleWidth,
    restoreBackgroundAfterResets,
    stripOscCodes,
    stripSgrCodes,
    truncateStyledText
} from '../ansi';

const OSC8_OPEN = '\x1b]8;;https://example.com\x1b\\';
const OSC8_CLOSE = '\x1b]8;;\x1b\\';
// 8-bit C1 forms: CSI (0x9b), OSC (0x9d) and String Terminator (0x9c).
const C1_OSC8_OPEN = '\x9d8;;https://example.com\x9c';
const C1_OSC8_CLOSE = '\x9d8;;\x9c';

describe('escape sequence parsing', () => {
    it('hides 8-bit C1 CSI and OSC sequences', () => {
        expect(getVisibleText('\x9b31mred\x9b39m')).toBe('red');
        expect(getVisibleText(`${C1_OSC8_OPEN}link${C1_OSC8_CLOSE}`)).toBe('link');
        expect(getVisibleWidth(`\x9b1m${C1_OSC8_OPEN}link${C1_OSC8_CLOSE}\x9b22m`)).toBe(4);
    });

    it('strips 8-bit OSC sequences but keeps 8-bit CSI styling', () => {
        expect(stripOscCodes(`\x9b31m${C1_OSC8_OPEN}link${C1_OSC8_CLOSE}`)).toBe('\x9b31mlink');
    });

    it('strips non-hyperlink OSC sequences such as window titles', () => {
        expect(stripOscCodes('\x1b]0;my title\x07\x1b[1mbold\x1b[22m')).toBe('\x1b[1mbold\x1b[22m');
    });

    it('swallows a CSI sequence left unterminated at the end of the text', () => {
        expect(getVisibleText('abc\x1b[38;5')).toBe('abc');
        expect(getVisibleWidth('abc\x9b38;5')).toBe(3);
    });

    it('swallows an OSC sequence left unterminated at the end of the text', () => {
        expect(getVisibleText('abc\x1b]8;;https://example.com')).toBe('abc');
        expect(stripOscCodes('\x1b[1mabc\x1b]8;;https://example.com')).toBe('\x1b[1mabc');
    });

    it('treats ESC followed by one other character as a two-character escape', () => {
        // ESC 7 / ESC 8 are save/restore cursor.
        expect(getVisibleText('a\x1b7b\x1b8c')).toBe('abc');
        expect(getVisibleWidth('a\x1b7b\x1b8c')).toBe(3);
    });

    it('swallows a lone ESC at the end of the text', () => {
        expect(getVisibleText('ab\x1b')).toBe('ab');
        expect(getVisibleWidth('ab\x1b')).toBe(2);
    });
});

describe('display width of grapheme clusters', () => {
    it('counts each flag (a regional indicator pair) as one two-column cluster', () => {
        expect(getVisibleWidth('🇺🇸')).toBe(2);
        expect(getVisibleWidth('🇺🇸🇫🇷')).toBe(4);
    });

    it('counts a ZWJ emoji sequence as one two-column cluster', () => {
        expect(getVisibleWidth('👨\u200d👩\u200d👧')).toBe(2);
        expect(getVisibleWidth('👨\u200d👩\u200d👧 ok')).toBe(5);
    });

    it('tolerates a ZWJ dangling at the end of the text', () => {
        expect(getVisibleWidth('ok\u200d')).toBe(2);
    });

    it('gives zero width to combining marks and variation selectors with no base character', () => {
        expect(getVisibleWidth('\u0301abc')).toBe(3);
        expect(getVisibleWidth('\ufe0f')).toBe(0);
        expect(getVisibleWidth('\u200dabc')).toBe(3);
    });
});

describe('truncateStyledText', () => {
    it('returns an empty string when there is no room at all', () => {
        expect(truncateStyledText('abc', 0)).toBe('');
        expect(truncateStyledText('abc', -1)).toBe('');
    });

    it('never splits a flag in half', () => {
        expect(truncateStyledText('🇺🇸🇫🇷', 3, { ellipsis: false })).toBe('🇺🇸');
    });

    it('never splits a ZWJ emoji sequence', () => {
        expect(truncateStyledText('👨\u200d👩\u200d👧 family', 4, { ellipsis: false })).toBe('👨\u200d👩\u200d👧 f');
        expect(truncateStyledText('a👨\u200d👩\u200d👧', 2, { ellipsis: false })).toBe('a');
    });

    it('does not add a hyperlink close when the link already closed before the cut', () => {
        const text = `${OSC8_OPEN}ab${OSC8_CLOSE}cdefgh`;

        expect(truncateStyledText(text, 5)).toBe(`${OSC8_OPEN}ab${OSC8_CLOSE}...`);
    });

    it('closes a hyperlink opened with a C1 string terminator', () => {
        const text = '\x1b]8;;https://example.com\x9clong-link-text';

        expect(truncateStyledText(text, 6)).toBe(`\x1b]8;;https://example.com\x9clon${OSC8_CLOSE}...`);
    });

    it('only treats well-formed OSC 8 sequences as open hyperlinks', () => {
        // An OSC 8 with no URL field, and a window-title OSC, are passed
        // through as-is and must not trigger an extra hyperlink close.
        expect(truncateStyledText('\x1b]8;\x07abcdefgh', 5)).toBe('\x1b]8;\x07ab...');
        expect(truncateStyledText('\x1b]0;title\x07abcdefgh', 5)).toBe('\x1b]0;title\x07ab...');
    });
});

describe('stripSgrCodes', () => {
    it('removes 7-bit and 8-bit color codes', () => {
        expect(stripSgrCodes('\x9b31mred\x9b39m')).toBe('red');
        expect(stripSgrCodes('\x1b[1m\x9b38;5;208mbold\x9b0m\x1b[22m')).toBe('bold');
    });

    it('leaves other CSI sequences and hyperlinks alone', () => {
        const text = `\x1b[2K\x9b2J${OSC8_OPEN}link${OSC8_CLOSE}${C1_OSC8_OPEN}c1${C1_OSC8_CLOSE}`;

        expect(stripSgrCodes(text)).toBe(text);
    });
});

describe('restoreBackgroundAfterResets', () => {
    const BG = '\x1b[44m';

    it('re-applies the background after every sequence that clears it', () => {
        expect(restoreBackgroundAfterResets('\x1b[31ma\x1b[0mb\x1b[mc\x1b[00md\x1b[;1me\x1b[39;49mf', BG))
            .toBe(`\x1b[31ma\x1b[0m${BG}b\x1b[m${BG}c\x1b[00m${BG}d\x1b[;1m${BG}e\x1b[39;49m${BG}f`);
    });

    it('re-applies the background after an 8-bit reset', () => {
        expect(restoreBackgroundAfterResets('\x9b31ma\x9b0mb\x9b49mc', BG))
            .toBe(`\x9b31ma\x9b0m${BG}b\x9b49m${BG}c`);
    });

    it('leaves other styling, and the arguments of extended colors, alone', () => {
        const text = '\x1b[1;31ma\x1b[38;5;0mb\x1b[48;2;0;49;0mc\x1b[58;5;49md\x1b[39me';

        expect(restoreBackgroundAfterResets(text, BG)).toBe(text);
    });

    it.each([
        '0;40', '0;41', '0;47', '0;100', '0;107',
        '49;41', ';41', '0;48;5;49', '0;48;2;0;49;0',
        '41;0;42', '0;41;38;5;0', '0;41;58;5;49'
    ])('keeps the explicit background after a reset in SGR %s', (params) => {
        const text = `\x1b[${params}mtext`;

        expect(restoreBackgroundAfterResets(text, BG)).toBe(text);
    });

    it.each([
        '41;0', '107;49', '48;5;49;0', '48;2;0;49;0;49',
        '0;41;49', '0;41;', '0;38;5;0', '49;58;2;0;49;0'
    ])('restores the background when the final background operation clears it in SGR %s', (params) => {
        expect(restoreBackgroundAfterResets(`\x1b[${params}mtext`, BG))
            .toBe(`\x1b[${params}m${BG}text`);
    });
});
