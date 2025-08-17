import chalk, { type ChalkInstance } from 'chalk';

import type { ColorEntry } from '../types/ColorEntry';

// Re-export for backward compatibility
export type { ColorEntry };

// Create COLOR_MAP as a function so chalk instances are created with the correct level
function createColorMap(): ColorEntry[] {
    return [
    // Regular colors - for ansi256 mode, use fixed palette colors (16-231) instead of theme colors (0-15)
        { name: 'black', displayName: 'Black', isBackground: false, ansi16: chalk.black, ansi256: chalk.ansi256(16), truecolor: chalk.hex('#000000') },
        { name: 'red', displayName: 'Red', isBackground: false, ansi16: chalk.red, ansi256: chalk.ansi256(160), truecolor: chalk.hex('#cc0000') },
        { name: 'green', displayName: 'Green', isBackground: false, ansi16: chalk.green, ansi256: chalk.ansi256(70), truecolor: chalk.hex('#4e9a06') },
        { name: 'yellow', displayName: 'Yellow', isBackground: false, ansi16: chalk.yellow, ansi256: chalk.ansi256(178), truecolor: chalk.hex('#c4a000') },
        { name: 'blue', displayName: 'Blue', isBackground: false, ansi16: chalk.blue, ansi256: chalk.ansi256(26), truecolor: chalk.hex('#3465a4') },
        { name: 'magenta', displayName: 'Magenta', isBackground: false, ansi16: chalk.magenta, ansi256: chalk.ansi256(96), truecolor: chalk.hex('#75507b') },
        { name: 'cyan', displayName: 'Cyan', isBackground: false, ansi16: chalk.cyan, ansi256: chalk.ansi256(30), truecolor: chalk.hex('#06989a') },
        { name: 'white', displayName: 'White', isBackground: false, ansi16: chalk.white, ansi256: chalk.ansi256(188), truecolor: chalk.hex('#d3d7cf') },

        // Bright colors - use brighter fixed palette colors
        { name: 'brightBlack', displayName: 'Bright Black', isBackground: false, ansi16: chalk.blackBright, ansi256: chalk.ansi256(59), truecolor: chalk.hex('#555753') },
        { name: 'brightRed', displayName: 'Bright Red', isBackground: false, ansi16: chalk.redBright, ansi256: chalk.ansi256(203), truecolor: chalk.hex('#ef2929') },
        { name: 'brightGreen', displayName: 'Bright Green', isBackground: false, ansi16: chalk.greenBright, ansi256: chalk.ansi256(155), truecolor: chalk.hex('#8ae234') },
        { name: 'brightYellow', displayName: 'Bright Yellow', isBackground: false, ansi16: chalk.yellowBright, ansi256: chalk.ansi256(227), truecolor: chalk.hex('#fce94f') },
        { name: 'brightBlue', displayName: 'Bright Blue', isBackground: false, ansi16: chalk.blueBright, ansi256: chalk.ansi256(111), truecolor: chalk.hex('#729fcf') },
        { name: 'brightMagenta', displayName: 'Bright Magenta', isBackground: false, ansi16: chalk.magentaBright, ansi256: chalk.ansi256(140), truecolor: chalk.hex('#ad7fa8') },
        { name: 'brightCyan', displayName: 'Bright Cyan', isBackground: false, ansi16: chalk.cyanBright, ansi256: chalk.ansi256(80), truecolor: chalk.hex('#34e2e2') },
        { name: 'brightWhite', displayName: 'Bright White', isBackground: false, ansi16: chalk.whiteBright, ansi256: chalk.ansi256(231), truecolor: chalk.hex('#eeeeec') },

        // Background colors - match foreground indices for consistency
        { name: 'bgBlack', displayName: 'Black', isBackground: true, ansi16: chalk.bgBlack, ansi256: chalk.bgAnsi256(16), truecolor: chalk.bgHex('#000000') },
        { name: 'bgRed', displayName: 'Red', isBackground: true, ansi16: chalk.bgRed, ansi256: chalk.bgAnsi256(160), truecolor: chalk.bgHex('#cc0000') },
        { name: 'bgGreen', displayName: 'Green', isBackground: true, ansi16: chalk.bgGreen, ansi256: chalk.bgAnsi256(70), truecolor: chalk.bgHex('#4e9a06') },
        { name: 'bgYellow', displayName: 'Yellow', isBackground: true, ansi16: chalk.bgYellow, ansi256: chalk.bgAnsi256(178), truecolor: chalk.bgHex('#c4a000') },
        { name: 'bgBlue', displayName: 'Blue', isBackground: true, ansi16: chalk.bgBlue, ansi256: chalk.bgAnsi256(26), truecolor: chalk.bgHex('#3465a4') },
        { name: 'bgMagenta', displayName: 'Magenta', isBackground: true, ansi16: chalk.bgMagenta, ansi256: chalk.bgAnsi256(96), truecolor: chalk.bgHex('#75507b') },
        { name: 'bgCyan', displayName: 'Cyan', isBackground: true, ansi16: chalk.bgCyan, ansi256: chalk.bgAnsi256(30), truecolor: chalk.bgHex('#06989a') },
        { name: 'bgWhite', displayName: 'White', isBackground: true, ansi16: chalk.bgWhite, ansi256: chalk.bgAnsi256(188), truecolor: chalk.bgHex('#d3d7cf') },

        // Bright background colors - match bright foreground indices
        { name: 'bgBrightBlack', displayName: 'Bright Black', isBackground: true, ansi16: chalk.bgBlackBright, ansi256: chalk.bgAnsi256(59), truecolor: chalk.bgHex('#555753') },
        { name: 'bgBrightRed', displayName: 'Bright Red', isBackground: true, ansi16: chalk.bgRedBright, ansi256: chalk.bgAnsi256(203), truecolor: chalk.bgHex('#ef2929') },
        { name: 'bgBrightGreen', displayName: 'Bright Green', isBackground: true, ansi16: chalk.bgGreenBright, ansi256: chalk.bgAnsi256(155), truecolor: chalk.bgHex('#8ae234') },
        { name: 'bgBrightYellow', displayName: 'Bright Yellow', isBackground: true, ansi16: chalk.bgYellowBright, ansi256: chalk.bgAnsi256(227), truecolor: chalk.bgHex('#fce94f') },
        { name: 'bgBrightBlue', displayName: 'Bright Blue', isBackground: true, ansi16: chalk.bgBlueBright, ansi256: chalk.bgAnsi256(111), truecolor: chalk.bgHex('#729fcf') },
        { name: 'bgBrightMagenta', displayName: 'Bright Magenta', isBackground: true, ansi16: chalk.bgMagentaBright, ansi256: chalk.bgAnsi256(140), truecolor: chalk.bgHex('#ad7fa8') },
        { name: 'bgBrightCyan', displayName: 'Bright Cyan', isBackground: true, ansi16: chalk.bgCyanBright, ansi256: chalk.bgAnsi256(80), truecolor: chalk.bgHex('#34e2e2') },
        { name: 'bgBrightWhite', displayName: 'Bright White', isBackground: true, ansi16: chalk.bgWhiteBright, ansi256: chalk.bgAnsi256(231), truecolor: chalk.bgHex('#eeeeec') }
    ];
}

// Initialize with default, will be recreated when chalk.level is set
export let COLOR_MAP: ColorEntry[] = createColorMap();

// Function to recreate COLOR_MAP after chalk.level is set
export function updateColorMap(): void {
    COLOR_MAP = createColorMap();
}

export function bgToFg(colorName: string | undefined): string | undefined {
    if (!colorName)
        return undefined;

    // Custom formats pass through unchanged (ansi256:X and hex:XXXXXX)
    if (colorName.startsWith('ansi256:') || colorName.startsWith('hex:')) {
        return colorName;
    }

    // Convert background color names to foreground equivalents
    if (colorName.startsWith('bgBright')) {
        // bgBrightRed -> brightRed
        const baseName = colorName.substring(8);
        return 'bright' + baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase();
    } else if (colorName.startsWith('bg')) {
        // bgRed -> red
        const baseName = colorName.substring(2);
        return baseName.charAt(0).toLowerCase() + baseName.slice(1);
    }

    // Already a foreground color
    return colorName;
}

export function getChalkColor(colorName: string | undefined, colorLevel: 'ansi16' | 'ansi256' | 'truecolor' = 'ansi16', isBackground = false): ChalkInstance | undefined {
    if (!colorName)
        return undefined;

    // Handle ansi256:X format
    if (colorName.startsWith('ansi256:')) {
        const code = parseInt(colorName.substring(8), 10);
        if (!isNaN(code) && code >= 0 && code <= 255) {
            return isBackground ? chalk.bgAnsi256(code) : chalk.ansi256(code);
        }
        return undefined;
    }

    // Handle hex:XXXXXX format
    if (colorName.startsWith('hex:')) {
        const hex = colorName.substring(4);
        if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
            return isBackground ? chalk.bgHex('#' + hex) : chalk.hex('#' + hex);
        }
        return undefined;
    }

    const colorEntry = COLOR_MAP.find(c => c.name === colorName);

    if (!colorEntry) {
        return undefined;
    }

    switch (colorLevel) {
    case 'ansi256':
        return colorEntry.ansi256;
    case 'truecolor':
        return colorEntry.truecolor;
    case 'ansi16':
    default:
        return colorEntry.ansi16;
    }
}

export function applyColors(
    text: string,
    foregroundColor?: string,
    backgroundColor?: string,
    bold?: boolean,
    colorLevel: 'ansi16' | 'ansi256' | 'truecolor' = 'ansi16'
): string {
    if (!foregroundColor && !backgroundColor && !bold) {
        return text;
    }

    let result = text;

    // Apply background color first
    // This ensures the background is properly established before other styles
    if (backgroundColor) {
        const bgChalk = getChalkColor(backgroundColor, colorLevel, true);
        if (bgChalk) {
            result = bgChalk(result);
        }
    }

    // Apply foreground color second
    if (foregroundColor) {
        const fgChalk = getChalkColor(foregroundColor, colorLevel, false);
        if (fgChalk) {
            result = fgChalk(result);
        }
    }

    // Apply bold last if needed
    if (bold) {
        result = chalk.bold(result);
    }

    return result;
}

// Get raw ANSI codes for a color without the reset codes
export function getColorAnsiCode(colorName: string | undefined, colorLevel: 'ansi16' | 'ansi256' | 'truecolor' = 'ansi16', isBackground = false): string {
    if (!colorName)
        return '';

    // Handle ansi256:X format
    if (colorName.startsWith('ansi256:')) {
        const code = parseInt(colorName.substring(8), 10);
        if (!isNaN(code) && code >= 0 && code <= 255) {
            return isBackground ? `\x1b[48;5;${code}m` : `\x1b[38;5;${code}m`;
        }
        return '';
    }

    // Handle hex:XXXXXX format
    if (colorName.startsWith('hex:')) {
        const hex = colorName.substring(4);
        if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return isBackground ? `\x1b[48;2;${r};${g};${b}m` : `\x1b[38;2;${r};${g};${b}m`;
        }
        return '';
    }

    // Find the color in COLOR_MAP
    const colorEntry = COLOR_MAP.find(c => c.name === colorName);
    if (!colorEntry)
        return '';

    // Now that chalk.level is set correctly, we can use chalk to generate the codes
    let chalkFn: ChalkInstance;
    switch (colorLevel) {
    case 'ansi256':
        chalkFn = colorEntry.ansi256;
        break;
    case 'truecolor':
        chalkFn = colorEntry.truecolor;
        break;
    default:
        chalkFn = colorEntry.ansi16;
        break;
    }

    // Apply the color and extract the opening ANSI code
    const colored = chalkFn('TEST');
    const escapeChar = '\u001b'; // ESC character
    const ansiRegex = new RegExp(`^(${escapeChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[[^m]+m)`);
    const match = ansiRegex.exec(colored);
    return match?.[1] ?? '';
}

export function getColorDisplayName(colorName: string): string {
    const colorEntry = COLOR_MAP.find(c => c.name === colorName);
    return colorEntry?.displayName ?? colorName;
}

export function getAvailableColors(): string[] {
    return COLOR_MAP.map(c => c.name);
}

export function getAvailableColorsForUI(): { name: string; value: string }[] {
    // Add default option, then filter for non-background colors
    return [
        { name: 'Default', value: '' },
        ...COLOR_MAP
            .filter(c => !c.isBackground)
            .map(c => ({ name: c.displayName, value: c.name }))
    ];
}

export function getAvailableBackgroundColorsForUI(): { name: string; value: string }[] {
    // Add default/none option, then filter for background colors
    return [
        { name: 'Default', value: '' },
        ...COLOR_MAP
            .filter(c => c.isBackground)
            .map(c => ({ name: c.displayName, value: c.name }))
    ];
}

export function getBackgroundColorsForPowerline(): string[] {
    // Get background colors excluding black for better visibility in powerline mode
    return COLOR_MAP
        .filter(c => c.isBackground && c.name !== 'bgBlack')
        .map(c => c.name);
}

// Powerline theme definitions
export interface PowerlineThemeColors {
    fg: string[];
    bg: string[];
}

export interface PowerlineTheme {
    name: string;
    description: string;
    // Color levels: 1 = basic 16, 2 = 256, 3 = truecolor
    1?: PowerlineThemeColors;
    2?: PowerlineThemeColors;
    3?: PowerlineThemeColors;
}

export const POWERLINE_THEMES: Record<string, PowerlineTheme> = {
    'custom': {
        name: 'Custom',
        description: 'Uses individual widget background colors'
        // No color definitions - handled specially
    },
    'nord': {
        name: 'Nord',
        description: 'Arctic, north-bluish color palette',
        1: {
            fg: ['black', 'brightWhite', 'brightWhite', 'black', 'black'],
            bg: ['bgBrightCyan', 'bgBrightBlack', 'bgBlue', 'bgBrightYellow', 'bgBrightGreen']
        },
        2: {
            fg: ['ansi256:16', 'ansi256:254', 'ansi256:231', 'ansi256:231', 'ansi256:16'],
            bg: ['ansi256:73', 'ansi256:239', 'ansi256:25', 'ansi256:96', 'ansi256:152']
        },
        3: {
            fg: ['hex:2E3440', 'hex:D8DEE9', 'hex:FDF6E3', 'hex:2E3440', 'hex:2E3440'],
            bg: ['hex:88C0D0', 'hex:4C566A', 'hex:5E81AC', 'hex:B48EAD', 'hex:A3BE8C']
        }
    },
    'nord-aurora': {
        name: 'Nord Aurora',
        description: 'Nord theme with aurora colors',
        1: {
            fg: ['brightWhite', 'black', 'black', 'black', 'black'],
            bg: ['bgRed', 'bgBrightYellow', 'bgBrightBlue', 'bgGreen', 'bgBrightMagenta']
        },
        2: {
            fg: ['ansi256:231', 'ansi256:16', 'ansi256:231', 'ansi256:16', 'ansi256:16'],
            bg: ['ansi256:131', 'ansi256:220', 'ansi256:68', 'ansi256:108', 'ansi256:176']
        },
        3: {
            fg: ['hex:ECEFF4', 'hex:2E3440', 'hex:FDF6E3', 'hex:2E3440', 'hex:2E3440'],
            bg: ['hex:BF616A', 'hex:EBCB8B', 'hex:5E81AC', 'hex:A3BE8C', 'hex:B48EAD']
        }
    },
    'monokai': {
        name: 'Monokai',
        description: 'Dark background with vibrant colors',
        1: {
            fg: ['black', 'brightWhite', 'black', 'white', 'black'],
            bg: ['bgBrightGreen', 'bgBrightBlack', 'bgBrightYellow', 'bgMagenta', 'bgBrightCyan']
        },
        2: {
            fg: ['ansi256:235', 'ansi256:255', 'ansi256:235', 'ansi256:16', 'ansi256:235'],
            bg: ['ansi256:148', 'ansi256:238', 'ansi256:186', 'ansi256:141', 'ansi256:81']
        },
        3: {
            fg: ['hex:272822', 'hex:F8F8F2', 'hex:272822', 'hex:272822', 'hex:272822'],
            bg: ['hex:A6E22E', 'hex:49483E', 'hex:E6DB74', 'hex:AE81FF', 'hex:66D9EF']
        }
    },
    'solarized': {
        name: 'Solarized',
        description: 'Precision colors for readability',
        1: {
            fg: ['brightWhite', 'black', 'brightWhite', 'black', 'black'],
            bg: ['bgBlue', 'bgBrightYellow', 'bgBrightBlack', 'bgCyan', 'bgBrightWhite']
        },
        2: {
            fg: ['ansi256:231', 'ansi256:234', 'ansi256:254', 'ansi256:16', 'ansi256:234'],
            bg: ['ansi256:33', 'ansi256:136', 'ansi256:240', 'ansi256:37', 'ansi256:254']
        },
        3: {
            fg: ['hex:073642', 'hex:073642', 'hex:FDF6E3', 'hex:073642', 'hex:073642'],
            bg: ['hex:268BD2', 'hex:B58900', 'hex:586E75', 'hex:2AA198', 'hex:EEE8D5']
        }
    },
    'minimal': {
        name: 'Minimal',
        description: 'Clean monochrome theme',
        1: {
            fg: ['brightWhite', 'black', 'white', 'black', 'black'],
            bg: ['bgBrightBlack', 'bgBrightWhite', 'bgBlack', 'bgWhite', 'bgBrightWhite']
        },
        2: {
            fg: ['ansi256:255', 'ansi256:232', 'ansi256:255', 'ansi256:232', 'ansi256:252'],
            bg: ['ansi256:240', 'ansi256:251', 'ansi256:233', 'ansi256:248', 'ansi256:236']
        },
        3: {
            fg: ['hex:FFFFFF', 'hex:1C1C1C', 'hex:FFFFFF', 'hex:1C1C1C', 'hex:E4E4E4'],
            bg: ['hex:585858', 'hex:D0D0D0', 'hex:1A1A1A', 'hex:A8A8A8', 'hex:303030']
        }
    },
    'dracula': {
        name: 'Dracula',
        description: 'Dark theme with purple accents',
        1: {
            fg: ['brightWhite', 'black', 'brightWhite', 'black', 'white'],
            bg: ['bgMagenta', 'bgBrightWhite', 'bgRed', 'bgBrightCyan', 'bgBrightBlack']
        },
        2: {
            fg: ['ansi256:235', 'ansi256:235', 'ansi256:235', 'ansi256:235', 'ansi256:231'],
            bg: ['ansi256:141', 'ansi256:253', 'ansi256:204', 'ansi256:117', 'ansi256:236']
        },
        3: {
            fg: ['hex:282A36', 'hex:282A36', 'hex:282A36', 'hex:282A36', 'hex:F8F8F2'],
            bg: ['hex:BD93F9', 'hex:F8F8F2', 'hex:FF5555', 'hex:8BE9FD', 'hex:44475A']
        }
    },
    'catppuccin': {
        name: 'Catppuccin',
        description: 'Soothing pastel theme',
        1: {
            fg: ['black', 'brightWhite', 'black', 'brightWhite', 'black'],
            bg: ['bgBrightMagenta', 'bgBrightBlack', 'bgBrightGreen', 'bgBlue', 'bgBrightYellow']
        },
        2: {
            fg: ['ansi256:235', 'ansi256:255', 'ansi256:235', 'ansi256:235', 'ansi256:235'],
            bg: ['ansi256:176', 'ansi256:238', 'ansi256:150', 'ansi256:210', 'ansi256:111']
        },
        3: {
            fg: ['hex:1E1E2E', 'hex:CDD6F4', 'hex:1E1E2E', 'hex:1E1E2E', 'hex:CDD6F4'],
            bg: ['hex:CBA6F7', 'hex:45475A', 'hex:A6E3A1', 'hex:F38BA8', 'hex:585B70']
        }
    },
    'gruvbox': {
        name: 'Gruvbox',
        description: 'Retro groove color scheme',
        1: {
            fg: ['brightWhite', 'black', 'black', 'brightWhite', 'black'],
            bg: ['bgRed', 'bgBrightYellow', 'bgBrightWhite', 'bgBlue', 'bgBrightGreen']
        },
        2: {
            fg: ['ansi256:16', 'ansi256:235', 'ansi256:235', 'ansi256:16', 'ansi256:235'],
            bg: ['ansi256:167', 'ansi256:214', 'ansi256:246', 'ansi256:109', 'ansi256:142']
        },
        3: {
            fg: ['hex:EBDBB2', 'hex:282828', 'hex:282828', 'hex:FDF6E3', 'hex:282828'],
            bg: ['hex:CC241D', 'hex:FABD2F', 'hex:A89984', 'hex:458588', 'hex:98971A']
        }
    },
    'onedark': {
        name: 'One Dark',
        description: 'Atom-inspired dark theme',
        1: {
            fg: ['black', 'brightWhite', 'black', 'brightWhite', 'black'],
            bg: ['bgBrightBlue', 'bgBrightBlack', 'bgBrightGreen', 'bgRed', 'bgBrightYellow']
        },
        2: {
            fg: ['ansi256:235', 'ansi256:251', 'ansi256:235', 'ansi256:16', 'ansi256:235'],
            bg: ['ansi256:75', 'ansi256:237', 'ansi256:114', 'ansi256:204', 'ansi256:180']
        },
        3: {
            fg: ['hex:282C34', 'hex:ABB2BF', 'hex:282C34', 'hex:282C34', 'hex:282C34'],
            bg: ['hex:61AFEF', 'hex:3E4452', 'hex:98C379', 'hex:E06C75', 'hex:E5C07B']
        }
    },
    'tokyonight': {
        name: 'Tokyo Night',
        description: 'Clean, dark theme inspired by Tokyo nightlife',
        1: {
            fg: ['brightWhite', 'black', 'brightWhite', 'black', 'black'],
            bg: ['bgBlue', 'bgBrightWhite', 'bgMagenta', 'bgBrightYellow', 'bgBrightCyan']
        },
        2: {
            fg: ['ansi256:16', 'ansi256:234', 'ansi256:16', 'ansi256:234', 'ansi256:234'],
            bg: ['ansi256:111', 'ansi256:248', 'ansi256:176', 'ansi256:221', 'ansi256:80']
        },
        3: {
            fg: ['hex:1A1B26', 'hex:1A1B26', 'hex:1A1B26', 'hex:1A1B26', 'hex:1A1B26'],
            bg: ['hex:7AA2F7', 'hex:D5D6DB', 'hex:BB9AF7', 'hex:E0AF68', 'hex:7DCFFF']
        }
    }
};

export function getPowerlineThemes(): string[] {
    return Object.keys(POWERLINE_THEMES);
}

export function getPowerlineTheme(name: string): PowerlineTheme | undefined {
    return POWERLINE_THEMES[name];
}

export function getDefaultPowerlineTheme(): string {
    return 'nord-aurora';
}