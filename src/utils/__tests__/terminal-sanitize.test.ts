import {
    describe,
    expect,
    it
} from 'vitest';

import {
    isSafeHyperlinkUrl,
    sanitizeTerminalText
} from '../terminal-sanitize';

const ESC = '\x1b';
const BEL = '\x07';
const ST = `${ESC}\\`;

describe('sanitizeTerminalText', () => {
    it('leaves plain text, Unicode and tabs and newlines alone', () => {
        const text = 'main ✓ 日本語 👩‍💻 \uE0A0\tnext\nline';

        expect(sanitizeTerminalText(text)).toBe(text);
    });

    it.each([
        ['reset', `${ESC}[0m`],
        ['256 colors', `${ESC}[38;5;208m`],
        ['true color with colons', `${ESC}[38:2::255:128:0m`],
        ['bold and dim', `${ESC}[1;2m`]
    ])('keeps color codes (%s)', (_label, code) => {
        expect(sanitizeTerminalText(`${code}text${ESC}[39m`)).toBe(`${code}text${ESC}[39m`);
    });

    it.each([
        ['ST', ST],
        ['BEL', BEL]
    ])('keeps hyperlinks with a safe URL, terminated by %s', (_label, terminator) => {
        const link = `${ESC}]8;;https://github.com/o/r${terminator}text${ESC}]8;;${terminator}`;

        expect(sanitizeTerminalText(link)).toBe(link);
    });

    it('keeps hyperlinks whose URL holds non-ASCII characters', () => {
        const link = `${ESC}]8;;https://example.com/café/日本${ST}text${ESC}]8;;${ST}`;

        expect(sanitizeTerminalText(link)).toBe(link);
    });

    // `tput sgr0` prints ESC ( B before its reset
    it('drops a charset escape whole, keeping the colors around it', () => {
        expect(sanitizeTerminalText(`${ESC}[31mred${ESC}(B${ESC}[m plain`)).toBe(`${ESC}[31mred${ESC}[m plain`);
    });

    it.each([
        ['an OSC 52 clipboard write', `${ESC}]52;c;ZWNobyBwd25lZA==${BEL}`],
        ['an OSC 0 title change', `${ESC}]0;hacked${ST}`],
        ['an OSC 2 title change', `${ESC}]2;hacked${BEL}`],
        ['a hyperlink with parameters outside the allowed set', `${ESC}]8;id=a b;https://x${ST}`],
        ['clearing the screen', `${ESC}[2J`],
        ['moving the cursor', `${ESC}[10;20H`],
        ['erasing the line', `${ESC}[K`],
        ['a DCS string', `${ESC}Pq#0;2;0;0;0${ST}`],
        ['an APC string', `${ESC}_payload${ST}`],
        ['a PM string', `${ESC}^payload${ST}`],
        ['a SOS string', `${ESC}Xpayload${ST}`],
        ['a two-character escape', `${ESC}c`],
        ['a charset escape', `${ESC}(B`],
        ['an escape with two intermediate bytes', `${ESC}$(C`],
        ['a line-size escape', `${ESC}#8`]
    ])('drops %s entirely', (_label, sequence) => {
        expect(sanitizeTerminalText(`a${sequence}b`)).toBe('ab');
    });

    it('drops a lone ESC at the end', () => {
        expect(sanitizeTerminalText(`a${ESC}`)).toBe('a');
    });

    it('drops an unterminated OSC string up to the next escape', () => {
        expect(sanitizeTerminalText(`a${ESC}]52;c;AAAA${ESC}[1mb`)).toBe(`a${ESC}[1mb`);
    });

    it.each([
        ['BEL', BEL],
        ['backspace', '\b'],
        ['carriage return', '\r'],
        ['shift out', '\x0e'],
        ['form feed', '\f'],
        ['DEL', '\x7f'],
        ['8-bit CSI', '\x9b'],
        ['8-bit OSC', '\x9d'],
        ['8-bit ST', '\x9c'],
        ['8-bit DCS', '\x90'],
        ['NEL', '\x85']
    ])('drops the control character %s', (_label, control) => {
        expect(sanitizeTerminalText(`a${control}b`)).toBe('ab');
    });

    it('drops an 8-bit CSI sequence\'s introducer, leaving its harmless parameters as text', () => {
        expect(sanitizeTerminalText('a\x9b2Jb')).toBe('a2Jb');
    });
});

describe('isSafeHyperlinkUrl', () => {
    it.each([
        'https://github.com/owner/repo',
        'https://gitlab.com/o/r/-/tree/feature%2Fx',
        'vscode://file/C:/path/to/file.ts',
        'file:///tmp/a%20b',
        'https://example.com/café',
        'https://例え.jp/パス'
    ])('accepts %s', (url) => {
        expect(isSafeHyperlinkUrl(url)).toBe(true);
    });

    it.each([
        ['an ESC', `https://x/${ESC}]52;c;AAAA${BEL}`],
        ['a BEL', `https://x/${BEL}`],
        ['a space', 'https://x/a b'],
        ['an 8-bit ST', 'https://x/\x9c'],
        ['a DEL', 'https://x/\x7f'],
        ['a tab', 'https://x/a\tb']
    ])('rejects a URL with %s', (_label, url) => {
        expect(isSafeHyperlinkUrl(url)).toBe(false);
    });
});
