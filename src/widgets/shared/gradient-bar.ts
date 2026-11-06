import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import {
    gradientCodeAt,
    type Rgb
} from '../../utils/gradient';

import { removeMetadataKeys } from './metadata';

export const BAR_GRADIENT_PRESETS = ['traffic', 'thermal', 'viridis', 'cividis', 'blue-orange', 'mono'] as const;
export type BarGradientPreset = typeof BAR_GRADIENT_PRESETS[number];

interface BarGradient { stops: Rgb[] }

function hex(value: string): Rgb {
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16)
    };
}

// Every preset runs from calm to urgent. Viridis, cividis, blue-orange and mono
// stay readable with red-green color blindness; viridis, cividis and mono get
// steadily brighter, so they also read in grayscale. Viridis and cividis skip
// their darkest colors, which vanish on black terminals and dark Powerline segments.
const BAR_GRADIENTS: Record<BarGradientPreset, BarGradient> = {
    'traffic': { stops: [hex('00C850'), hex('DCC800'), hex('DC2814')] },
    'thermal': { stops: [hex('3A6FD8'), hex('A24BD0'), hex('E8364A')] },
    'viridis': { stops: [hex('2A788E'), hex('22A884'), hex('7AD151'), hex('FDE725')] },
    'cividis': { stops: [hex('3E6AA8'), hex('8A8779'), hex('FFEA46')] },
    'blue-orange': { stops: [hex('0072B2'), hex('F0E442'), hex('D55E00')] },
    'mono': { stops: [hex('707070'), hex('B4B4B4'), hex('FFFFFF')] }
};

export function isBarGradientPreset(value: string | undefined): value is BarGradientPreset {
    return (BAR_GRADIENT_PRESETS as readonly string[]).includes(value ?? '');
}

const EMPTY_CELL_CODE = '\x1b[38;2;60;60;60m';
// The block bars' cells, and the line bar's
const FILLED_CELLS = new Set(['█', '▓', '━']);
const EMPTY_CELLS = new Set(['░', '─']);
// The usage widgets' time cursor takes a cell's place but keeps the widget color
const CURSOR_CELLS = new Set(['│']);
const DEFAULT_FOREGROUND = '\x1b[39m';

// Colors a bar's filled cells by where they sit along the preset's gradient, so
// a fuller bar reaches further toward its urgent end, and its empty cells dark gray.
// Truecolor only: the 256-color palette is too coarse for a smooth gradient.
// Other characters, such as brackets, are left alone. Each colored run ends with
// the default-foreground code, which the renderer turns back into the widget's
// own color. Reversed runs the gradient from the urgent end, for bars that fill
// with what's left.
export function paintGradientBar(bar: string, preset: BarGradientPreset = 'traffic', reversed = false): string {
    const gradient = BAR_GRADIENTS[preset];
    const chars = Array.from(bar);
    const isCell = (char: string) => FILLED_CELLS.has(char) || EMPTY_CELLS.has(char) || CURSOR_CELLS.has(char);
    const cellCount = chars.filter(isCell).length;
    let cellIndex = 0;
    let activeCode = '';
    let painted = '';

    for (const char of chars) {
        let code = '';
        if (FILLED_CELLS.has(char)) {
            const position = cellCount > 1 ? cellIndex / (cellCount - 1) : 0;
            code = gradientCodeAt(gradient.stops, reversed ? 1 - position : position, 'truecolor');
        } else if (EMPTY_CELLS.has(char)) {
            code = EMPTY_CELL_CODE;
        }
        if (isCell(char)) {
            cellIndex++;
        }

        if (code !== activeCode) {
            painted += code || DEFAULT_FOREGROUND;
            activeCode = code;
        }
        painted += char;
    }

    return activeCode ? painted + DEFAULT_FOREGROUND : painted;
}

export const CYCLE_GRADIENT_ACTION = 'cycle-gradient';
const GRADIENT_KEY = 'gradient';
const GRADIENT_KEYBIND: CustomKeybind = { key: 'g', label: '(g)radient', action: CYCLE_GRADIENT_ACTION };

// "true" is the earlier on/off setting, from before there were presets
export function getGradientPreset(item: WidgetItem): BarGradientPreset | null {
    const value = item.metadata?.[GRADIENT_KEY];
    if (value === 'true') {
        return 'traffic';
    }
    return isBarGradientPreset(value) ? value : null;
}

// Off, then each preset in turn, then off again
export function cycleGradientPreset(item: WidgetItem): WidgetItem {
    const current = getGradientPreset(item);
    const next = current === null ? BAR_GRADIENT_PRESETS[0] : BAR_GRADIENT_PRESETS[BAR_GRADIENT_PRESETS.indexOf(current) + 1];
    if (!next) {
        return removeMetadataKeys(item, [GRADIENT_KEY]);
    }
    return { ...item, metadata: { ...item.metadata, [GRADIENT_KEY]: next } };
}

// The 256-color palette is too coarse for a smooth gradient, so it needs truecolor
export function supportsBarGradient(settings: Settings): boolean {
    return settings.colorLevel === 3;
}

// A widget offers (g) while it shows a bar; the line editor hides it below
// truecolor (see filterGradientKeybinds)
export function getGradientKeybinds(showsBar: boolean): CustomKeybind[] {
    return showsBar ? [GRADIENT_KEYBIND] : [];
}

// The line editor's modifier for the widget's preset, e.g. "gradient: thermal"
export function getGradientModifier(item: WidgetItem): string | null {
    const preset = getGradientPreset(item);
    return preset ? `gradient: ${preset}` : null;
}

// Like Edit Colors' color options, (g) is offered only where it can show
export function filterGradientKeybinds(keybinds: CustomKeybind[], settings: Settings): CustomKeybind[] {
    return supportsBarGradient(settings) ? keybinds : keybinds.filter(keybind => keybind.action !== CYCLE_GRADIENT_ACTION);
}

// Below truecolor a saved preset renders plain; the line editor says why
export function noteGradientNeedsTruecolor(modifierText: string | undefined, settings: Settings): string | undefined {
    if (!modifierText || supportsBarGradient(settings)) {
        return modifierText;
    }
    return modifierText.replace(/gradient: ([a-z-]+)/, 'gradient: $1, needs truecolor');
}

// A bar with a preset colors its own cells, so a gradient widget color has to
// go around them instead of over them (Widget.colorsOnlyItsRuns). Below
// truecolor or under a global foreground override nothing is painted, and there
// is nothing to go around.
export function paintsBarGradient(item: WidgetItem, showsBar: boolean): boolean {
    return showsBar && getGradientPreset(item) !== null;
}

// Paints a widget's bar with its gradient preset when the settings allow it. A
// global foreground override owns every widget's foreground, so it wins.
// Reversed is for bars that fill with what's left: the color where the fill
// ends then still shows how urgent things are.
export function paintWidgetBar(bar: string, item: WidgetItem, settings: Settings, reversed = false): string {
    const preset = getGradientPreset(item);
    const override = settings.overrideForegroundColor;
    if (!preset || !supportsBarGradient(settings) || (override && override !== 'none')) {
        return bar;
    }
    return paintGradientBar(bar, preset, reversed);
}
