import tinygradient from 'tinygradient';

// A parsed gradient definition ready to be interpolated.
export interface GradientSpec {
    stops: string[]; // hex colors including the leading '#'
    hsv: boolean;
    hsvSpin: 'short' | 'long';
}

interface PresetDef {
    stops: string[];
    hsv?: boolean;
    hsvSpin?: 'short' | 'long';
}

// Named gradient presets. The color stops mirror the named gradients shipped by
// `gradient-string` (pulled in transitively through `ink-gradient`), reproduced
// here so the status line renderer can interpolate them without going through
// the React/Ink rendering layer.
// Source: gradient-string (MIT) - https://github.com/bokub/gradient-string
export const GRADIENT_PRESETS: Record<string, PresetDef> = {
    atlas: { stops: ['#feac5e', '#c779d0', '#4bc0c8'] },
    cristal: { stops: ['#bdfff3', '#4ac29a'] },
    teen: { stops: ['#77a1d3', '#79cbca', '#e684ae'] },
    mind: { stops: ['#473b7b', '#3584a7', '#30d2be'] },
    morning: { stops: ['#ff5f6d', '#ffc371'], hsv: true, hsvSpin: 'short' },
    vice: { stops: ['#5ee7df', '#b490ca'], hsv: true, hsvSpin: 'short' },
    passion: { stops: ['#f43b47', '#453a94'] },
    fruit: { stops: ['#ff4e50', '#f9d423'] },
    instagram: { stops: ['#833ab4', '#fd1d1d', '#fcb045'] },
    retro: { stops: ['#3f51b1', '#5a55ae', '#7b5fac', '#8f6aae', '#a86aa4', '#cc6b8e', '#f18271', '#f3a469', '#f7c978'] },
    summer: { stops: ['#fdbb2d', '#22c1c3'] },
    rainbow: { stops: ['#ff0000', '#ff0100'], hsv: true, hsvSpin: 'long' },
    pastel: { stops: ['#74ebd5', '#74ecd5'], hsv: true, hsvSpin: 'long' }
};

export const GRADIENT_PRESET_NAMES: string[] = Object.keys(GRADIENT_PRESETS);

const HEX6 = /^[0-9A-Fa-f]{6}$/;

// Parse a `gradient:<name>` or `gradient:RRGGBB-RRGGBB[-RRGGBB...]` color value.
// Returns null for anything that is not a valid gradient spec (never throws).
export function parseGradientSpec(color: string | undefined): GradientSpec | null {
    if (!color?.startsWith('gradient:')) {
        return null;
    }

    const body = color.slice('gradient:'.length);
    if (!body) {
        return null;
    }

    // Named preset (case-insensitive)
    const preset = GRADIENT_PRESETS[body.toLowerCase()];
    if (preset) {
        return {
            stops: preset.stops,
            hsv: preset.hsv ?? false,
            hsvSpin: preset.hsvSpin ?? 'short'
        };
    }

    // Custom stops: RRGGBB-RRGGBB[-RRGGBB...] (at least 2 stops; tinygradient
    // throws with fewer than 2).
    const parts = body.split('-');
    if (parts.length >= 2 && parts.every(p => HEX6.test(p))) {
        return {
            stops: parts.map(p => '#' + p),
            hsv: false,
            hsvSpin: 'short'
        };
    }

    return null;
}

// Convert an RGB triple to the nearest xterm 256-color palette index.
// Standard algorithm used by ansi-styles / chalk.
export function rgbToAnsi256(r: number, g: number, b: number): number {
    if (r === g && g === b) {
        if (r < 8) {
            return 16;
        }
        if (r > 248) {
            return 231;
        }
        return Math.round(((r - 8) / 247) * 24) + 232;
    }

    return 16
        + (36 * Math.round((r / 255) * 5))
        + (6 * Math.round((g / 255) * 5))
        + Math.round((b / 255) * 5);
}

// Apply a gradient across the visible characters of `text`, emitting one opening
// color code per visible character. Whitespace is left uncolored (and does not
// consume a gradient step), matching gradient-string's behavior. No reset code is
// emitted here - the caller is responsible for the trailing `\x1b[39m`.
//
// At ansi16 the gradient cannot be represented; the text is returned unchanged and
// the caller falls back to a solid first-stop color.
export function applyGradientToText(
    text: string,
    spec: GradientSpec,
    colorLevel: 'ansi16' | 'ansi256' | 'truecolor'
): string {
    if (colorLevel === 'ansi16' || text.length === 0) {
        return text;
    }

    let visibleCount = 0;
    for (const ch of text) {
        if (!/\s/.test(ch)) {
            visibleCount++;
        }
    }
    const count = Math.max(visibleCount, spec.stops.length);
    if (count === 0) {
        return text;
    }

    const grad = tinygradient(spec.stops);
    const colors = spec.hsv ? grad.hsv(count, spec.hsvSpin) : grad.rgb(count);

    let result = '';
    let i = 0;
    for (const ch of text) {
        if (/\s/.test(ch)) {
            result += ch;
            continue;
        }

        const color = colors[i++];
        const { r, g, b } = color ? color.toRgb() : { r: 255, g: 255, b: 255 };
        result += colorLevel === 'truecolor'
            ? `\x1b[38;2;${r};${g};${b}m${ch}`
            : `\x1b[38;5;${rgbToAnsi256(r, g, b)}m${ch}`;
    }

    return result;
}
