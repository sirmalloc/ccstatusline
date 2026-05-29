import {
    describe,
    expect,
    it
} from 'vitest';

import {
    GRADIENT_PRESET_NAMES,
    applyGradientToText,
    parseGradientSpec,
    rgbToAnsi256
} from '../gradient';

describe('parseGradientSpec', () => {
    it('parses named presets case-insensitively', () => {
        const retro = parseGradientSpec('gradient:retro');
        expect(retro).not.toBeNull();
        expect(retro?.stops).toHaveLength(9);
        expect(retro?.hsv).toBe(false);

        const upper = parseGradientSpec('gradient:RETRO');
        expect(upper?.stops).toHaveLength(9);
    });

    it('flags hsv presets with their spin', () => {
        const rainbow = parseGradientSpec('gradient:rainbow');
        expect(rainbow?.hsv).toBe(true);
        expect(rainbow?.hsvSpin).toBe('long');

        const vice = parseGradientSpec('gradient:vice');
        expect(vice?.hsv).toBe(true);
        expect(vice?.hsvSpin).toBe('short');
    });

    it('parses custom start/end and multi-stop hex specs', () => {
        const two = parseGradientSpec('gradient:ff5f6d-ffc371');
        expect(two?.stops).toEqual(['#ff5f6d', '#ffc371']);
        expect(two?.hsv).toBe(false);

        const three = parseGradientSpec('gradient:ff0000-00ff00-0000ff');
        expect(three?.stops).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    });

    it('rejects invalid specs without throwing', () => {
        expect(parseGradientSpec('gradient:')).toBeNull();
        expect(parseGradientSpec('gradient:notapreset')).toBeNull();
        expect(parseGradientSpec('gradient:ffffff')).toBeNull(); // single stop
        expect(parseGradientSpec('gradient:gggggg-000000')).toBeNull(); // bad hex
        expect(parseGradientSpec('hex:FF0000')).toBeNull();
        expect(parseGradientSpec(undefined)).toBeNull();
    });

    it('exposes the list of preset names', () => {
        expect(GRADIENT_PRESET_NAMES).toContain('retro');
        expect(GRADIENT_PRESET_NAMES).toContain('rainbow');
        expect(GRADIENT_PRESET_NAMES.length).toBeGreaterThanOrEqual(13);
    });
});

describe('rgbToAnsi256', () => {
    it('maps grayscale and cube anchors', () => {
        expect(rgbToAnsi256(0, 0, 0)).toBe(16);
        expect(rgbToAnsi256(255, 255, 255)).toBe(231);
        expect(rgbToAnsi256(255, 0, 0)).toBe(196);
        expect(rgbToAnsi256(128, 128, 128)).toBeGreaterThanOrEqual(232); // grayscale ramp
    });
});

describe('applyGradientToText', () => {
    const spec = parseGradientSpec('gradient:ff0000-0000ff');
    if (!spec) {
        throw new Error('expected a valid gradient spec');
    }

    it('emits one truecolor code per visible character and leaves spaces uncolored', () => {
        const out = applyGradientToText('AB CD', spec, 'truecolor');
        const codes = out.match(/\x1b\[38;2;\d+;\d+;\d+m/g) ?? [];
        // 4 visible characters (A, B, C, D) -> exactly 4 codes; the space gets none
        expect(codes).toHaveLength(4);
        // no per-character reset inside the body
        expect(out).not.toContain('\x1b[39m');
        // the raw space survives in the output, and is immediately followed by the
        // next character's color code (i.e. it consumed no gradient step)
        expect(out).toContain(' \x1b[38;2;');
        // gradient actually changes color: first and last codes differ
        expect(codes[0]).not.toBe(codes[codes.length - 1]);
    });

    it('uses 256-color codes at ansi256 level', () => {
        const out = applyGradientToText('ABCD', spec, 'ansi256');
        const codes = out.match(/\x1b\[38;5;\d+m/g) ?? [];
        expect(codes).toHaveLength(4);
        expect(out).not.toContain('38;2;');
    });

    it('returns text unchanged at ansi16', () => {
        expect(applyGradientToText('ABCD', spec, 'ansi16')).toBe('ABCD');
    });

    it('handles all-whitespace and empty input', () => {
        expect(applyGradientToText('   ', spec, 'truecolor')).toBe('   ');
        expect(applyGradientToText('', spec, 'truecolor')).toBe('');
    });
});
