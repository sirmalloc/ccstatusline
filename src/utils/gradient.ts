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

// Parse a "gradient:<stop>,<stop>,..." foreground spec into RGB color stops.
// Stops are hex (`hex:RRGGBB`, `#RRGGBB`, or bare `RRGGBB`). Returns null when
// the value is not a gradient spec or resolves to fewer than two usable stops.
export function parseGradientSpec(value: string | undefined): Rgb[] | null {
    if (!value?.startsWith(GRADIENT_PREFIX)) {
        return null;
    }

    const stops = value
        .slice(GRADIENT_PREFIX.length)
        .split(',')
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
