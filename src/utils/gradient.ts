export interface Rgb {
    r: number;
    g: number;
    b: number;
}

interface Oklab {
    L: number;
    a: number;
    b: number;
}

const GRADIENT_PREFIX = 'gradient:';
const HEX_PATTERN = /^[0-9A-Fa-f]{6}$/;
const ESC = '\x1b';
const BEL = '\x07';
const C1_CSI = '\x9b';
const C1_OSC = '\x9d';
const ST = '\x9c';

interface ParsedEscapeSequence {
    nextIndex: number;
    sequence: string;
}

// Named gradient presets, addressable as `gradient:<name>`. The stop lists mirror
// the named gradients shipped by `gradient-string` (pulled in transitively through
// `ink-gradient`), reproduced here as raw hex so the renderer can interpolate them
// without going through the React/Ink layer.
// Source: gradient-string (MIT) - https://github.com/bokub/gradient-string
//
// `gradient-string` renders `rainbow` and `pastel` via a full HSV hue-spin. We
// interpolate in OKLab (no hue-spin), so those two are re-expressed as explicit
// multi-stop hue wheels that sweep the spectrum directly.
export const GRADIENT_PRESETS: Record<string, string[]> = {
    atlas: ['#feac5e', '#c779d0', '#4bc0c8'],
    cristal: ['#bdfff3', '#4ac29a'],
    teen: ['#77a1d3', '#79cbca', '#e684ae'],
    mind: ['#473b7b', '#3584a7', '#30d2be'],
    morning: ['#ff5f6d', '#ffc371'],
    vice: ['#5ee7df', '#b490ca'],
    passion: ['#f43b47', '#453a94'],
    fruit: ['#ff4e50', '#f9d423'],
    instagram: ['#833ab4', '#fd1d1d', '#fcb045'],
    retro: ['#3f51b1', '#5a55ae', '#7b5fac', '#8f6aae', '#a86aa4', '#cc6b8e', '#f18271', '#f3a469', '#f7c978'],
    summer: ['#fdbb2d', '#22c1c3'],
    rainbow: ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'],
    pastel: ['#aee9d8', '#cdeeb0', '#f6f0a8', '#f7c8a8', '#f3aecb', '#c3b6f0', '#aee9d8']
};

export const GRADIENT_PRESET_NAMES: string[] = Object.keys(GRADIENT_PRESETS);

// True when a color value is a gradient spec (`gradient:…`). Centralizes the
// prefix check that callers use to branch before parsing.
export function isGradientSpec(value: string | undefined): boolean {
    return value?.startsWith(GRADIENT_PREFIX) ?? false;
}

// Parse a gradient foreground spec into RGB color stops. Three forms are
// accepted, all prefixed `gradient:`
//   - named preset            `gradient:atlas`              (case-insensitive)
//   - dash-separated stops     `gradient:RRGGBB-RRGGBB[-…]`
//   - comma-separated stops    `gradient:RRGGBB,RRGGBB[,…]`
// The comma vs dash choice is just the delimiter: a body containing a comma splits
// on commas, otherwise on dashes. Each stop is resolved by `resolveStopToRgb`, so
// `hex:RRGGBB`, `#RRGGBB`, and bare `RRGGBB` are all valid stop syntaxes in EITHER
// form (e.g. `gradient:hex:FF0000-hex:0000FF` parses fine) — the comment examples
// just show the common pairings. Returns null when the value is not a gradient spec
// or resolves to fewer than two usable stops.
export function parseGradientSpec(value: string | undefined): Rgb[] | null {
    if (!value?.startsWith(GRADIENT_PREFIX)) {
        return null;
    }

    const body = value.slice(GRADIENT_PREFIX.length).trim();
    if (!body) {
        return null;
    }

    const preset = GRADIENT_PRESETS[body.toLowerCase()];
    const rawStops = preset ?? body.split(body.includes(',') ? ',' : '-');

    const stops = rawStops
        .map(stop => stop.trim())
        .filter(stop => stop.length > 0)
        .map(resolveStopToRgb)
        .filter((rgb): rgb is Rgb => rgb !== null);

    return stops.length >= 2 ? stops : null;
}

function hexToRgb(hex: string): Rgb | null {
    if (!HEX_PATTERN.test(hex)) {
        return null;
    }
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
    };
}

function resolveStopToRgb(stop: string): Rgb | null {
    if (stop.startsWith('hex:')) {
        return hexToRgb(stop.slice(4));
    }
    if (stop.startsWith('#')) {
        return hexToRgb(stop.slice(1));
    }
    return hexToRgb(stop);
}

function srgbToLinear(channel: number): number {
    const normalized = channel / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
    const value = channel <= 0.0031308
        ? 12.92 * channel
        : 1.055 * (channel ** (1 / 2.4)) - 0.055;
    return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

// sRGB -> OKLab. Interpolating in OKLab keeps blends perceptually even and
// avoids the muddy mid-tones of naive sRGB interpolation.
function rgbToOklab(rgb: Rgb): Oklab {
    const lr = srgbToLinear(rgb.r);
    const lg = srgbToLinear(rgb.g);
    const lb = srgbToLinear(rgb.b);

    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

    const lCbrt = Math.cbrt(l);
    const mCbrt = Math.cbrt(m);
    const sCbrt = Math.cbrt(s);

    return {
        L: 0.2104542553 * lCbrt + 0.7936177850 * mCbrt - 0.0040720468 * sCbrt,
        a: 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt,
        b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt
    };
}

function oklabToRgb(lab: Oklab): Rgb {
    const lCbrt = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
    const mCbrt = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
    const sCbrt = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;

    const l = lCbrt ** 3;
    const m = mCbrt ** 3;
    const s = sCbrt ** 3;

    return {
        r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    };
}

// Sample the gradient at position t in [0, 1], interpolating in OKLab between
// the two bracketing stops.
export function sampleGradient(stops: Rgb[], t: number): Rgb {
    const first = stops[0];
    if (first === undefined) {
        return { r: 0, g: 0, b: 0 };
    }
    if (stops.length === 1) {
        return first;
    }

    const clamped = Math.min(1, Math.max(0, t));
    const scaled = clamped * (stops.length - 1);
    const lowerIndex = Math.min(stops.length - 2, Math.floor(scaled));
    const lower = stops[lowerIndex];
    const upper = stops[lowerIndex + 1];
    if (lower === undefined || upper === undefined) {
        return first;
    }

    const fraction = scaled - lowerIndex;
    const labLower = rgbToOklab(lower);
    const labUpper = rgbToOklab(upper);

    return oklabToRgb({
        L: labLower.L + (labUpper.L - labLower.L) * fraction,
        a: labLower.a + (labUpper.a - labLower.a) * fraction,
        b: labLower.b + (labUpper.b - labLower.b) * fraction
    });
}

// Map an RGB color to the nearest xterm-256 palette index (6x6x6 cube plus the
// grayscale ramp) for ansi256 terminals.
export function rgbToAnsi256(rgb: Rgb): number {
    if (rgb.r === rgb.g && rgb.g === rgb.b) {
        if (rgb.r < 8) {
            return 16;
        }
        if (rgb.r > 248) {
            return 231;
        }
        return Math.round(((rgb.r - 8) / 247) * 24) + 232;
    }

    return 16
        + 36 * Math.round((rgb.r / 255) * 5)
        + 6 * Math.round((rgb.g / 255) * 5)
        + Math.round((rgb.b / 255) * 5);
}

// Build the SGR foreground escape for the gradient color at position t. ansi16
// has too few colors for a gradient, so callers should degrade before this; it
// falls back to the 256-color path defensively.
export function gradientCodeAt(
    stops: Rgb[],
    t: number,
    colorLevel: 'ansi16' | 'ansi256' | 'truecolor'
): string {
    const rgb = sampleGradient(stops, t);
    if (colorLevel === 'truecolor') {
        return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
    }
    return `\x1b[38;5;${rgbToAnsi256(rgb)}m`;
}

const WHITESPACE = /\s/;

function isCsiFinalByte(codePoint: number): boolean {
    return codePoint >= 0x40 && codePoint <= 0x7e;
}

function consumeCsi(input: string, start: number, bodyStart: number): ParsedEscapeSequence {
    let index = bodyStart;
    while (index < input.length) {
        const codePoint = input.charCodeAt(index);
        if (isCsiFinalByte(codePoint)) {
            const end = index + 1;
            return {
                nextIndex: end,
                sequence: input.slice(start, end)
            };
        }
        index++;
    }

    return {
        nextIndex: input.length,
        sequence: input.slice(start)
    };
}

function consumeOsc(input: string, start: number, bodyStart: number): ParsedEscapeSequence {
    let index = bodyStart;
    while (index < input.length) {
        const current = input[index];
        if (!current) {
            break;
        }

        if (current === BEL || current === ST) {
            const end = index + 1;
            return {
                nextIndex: end,
                sequence: input.slice(start, end)
            };
        }

        if (current === ESC && input[index + 1] === '\\') {
            const end = index + 2;
            return {
                nextIndex: end,
                sequence: input.slice(start, end)
            };
        }

        index++;
    }

    return {
        nextIndex: input.length,
        sequence: input.slice(start)
    };
}

function consumeEscapeSequence(input: string, index: number): ParsedEscapeSequence | null {
    const current = input[index];
    if (!current) {
        return null;
    }

    if (current === ESC) {
        const next = input[index + 1];
        if (next === '[') {
            return consumeCsi(input, index, index + 2);
        }
        if (next === ']') {
            return consumeOsc(input, index, index + 2);
        }
        if (next) {
            return {
                nextIndex: index + 2,
                sequence: input.slice(index, index + 2)
            };
        }
        return {
            nextIndex: input.length,
            sequence: current
        };
    }

    if (current === C1_CSI) {
        return consumeCsi(input, index, index + 1);
    }

    if (current === C1_OSC) {
        return consumeOsc(input, index, index + 1);
    }

    return null;
}

// Apply a gradient across the visible characters of a single widget's text,
// emitting one opening color code per non-whitespace character. Whitespace is
// passed through uncolored and does not consume a gradient step, and ANSI/OSC
// escape sequences pass through untouched. The gradient restarts at t=0 for
// each call, so every widget spans its own self-contained sweep.
//
// No trailing reset is emitted here - the caller appends `\x1b[39m`. At ansi16
// (or for empty/blank text) the input is returned unchanged.
//
// KNOWN LIMITATION — code points, not grapheme clusters.
// This walks `text` with `for…of`, which iterates Unicode *code points*, whereas
// the whole-line `applyLineGradient` (in ansi.ts) walks *display clusters* via
// `consumeDisplayCluster`. For plain text (ASCII, single-code-point emoji) the two
// agree. They diverge only for multi-code-point grapheme clusters — ZWJ sequences
// (👩‍👩‍👧), variation selectors (✏️), regional-indicator flag pairs (🇺🇸): this
// function assigns a separate gradient step to each code point in the cluster
// (compressing the sweep there) and emits color codes onto zero-width joiner /
// selector code points that render nothing. The visible glyph still draws; the
// cosmetic effect is a locally faster sweep plus a few inert escape bytes.
//
// This divergence is deliberately tolerated rather than fixed:
//   1. Per-widget gradient text is short, author-controlled widget content — ZWJ
//      emoji are vanishingly rare there (the whole-line path, which is far more
//      likely to carry arbitrary cwd/branch text, IS cluster-correct).
//   2. The correct walker (`consumeDisplayCluster`) lives in ansi.ts, and ansi.ts
//      already imports from this module (gradient.ts) — depending on it back would
//      introduce a circular import. Unifying the two would require first extracting
//      the cluster walker into a third, dependency-free module. That refactor is a
//      tracked follow-up, not a blocker for correct rendering of real status lines.
export function applyGradientToText(
    text: string,
    stops: Rgb[],
    colorLevel: 'ansi16' | 'ansi256' | 'truecolor'
): string {
    if (colorLevel === 'ansi16' || text.length === 0) {
        return text;
    }

    let visibleCount = 0;
    let scanIndex = 0;
    while (scanIndex < text.length) {
        const escape = consumeEscapeSequence(text, scanIndex);
        if (escape) {
            scanIndex = escape.nextIndex;
            continue;
        }

        const codePoint = text.codePointAt(scanIndex);
        if (codePoint === undefined) {
            break;
        }

        const ch = String.fromCodePoint(codePoint);
        if (!WHITESPACE.test(ch)) {
            visibleCount++;
        }
        scanIndex += ch.length;
    }
    if (visibleCount === 0) {
        return text;
    }

    const denominator = Math.max(1, visibleCount - 1);
    let result = '';
    let index = 0;
    let textIndex = 0;
    while (textIndex < text.length) {
        const escape = consumeEscapeSequence(text, textIndex);
        if (escape) {
            result += escape.sequence;
            textIndex = escape.nextIndex;
            continue;
        }

        const codePoint = text.codePointAt(textIndex);
        if (codePoint === undefined) {
            break;
        }

        const ch = String.fromCodePoint(codePoint);
        if (WHITESPACE.test(ch)) {
            result += ch;
            textIndex += ch.length;
            continue;
        }
        result += gradientCodeAt(stops, index / denominator, colorLevel) + ch;
        index++;
        textIndex += ch.length;
    }

    return result;
}
