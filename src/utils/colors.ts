import chalk from 'chalk';

// Modern, attractive RGB color palette
// These colors are carefully chosen for good readability and visual appeal in terminals
export const COLOR_PALETTE = {
    // Basic colors with modern, vibrant but readable values
    black: '#1a1b26',      // Tokyo Night black
    red: '#f7768e',        // Soft red
    green: '#9ece6a',      // Soft green  
    yellow: '#e0af68',     // Warm yellow
    blue: '#7aa2f7',       // Soft blue
    magenta: '#bb9af7',    // Soft purple
    cyan: '#7dcfff',       // Soft cyan
    white: '#c0caf5',      // Off-white
    gray: '#565f89',       // Mid gray
    grey: '#565f89',       // Alias for gray
    
    // Bright variants
    brightBlack: '#414868',
    brightRed: '#ff9e64',
    brightGreen: '#73daca',
    brightYellow: '#ffc777',
    brightBlue: '#89ddff',
    brightMagenta: '#ff007c',
    brightCyan: '#b4f9f8',
    brightWhite: '#ffffff',
    
    // Background colors (slightly adjusted for better contrast)
    bgBlack: '#1a1b26',
    bgRed: '#f7768e',
    bgGreen: '#9ece6a',
    bgYellow: '#e0af68',
    bgBlue: '#7aa2f7',
    bgMagenta: '#bb9af7',
    bgCyan: '#7dcfff',
    bgWhite: '#c0caf5',
    bgGray: '#565f89',
    bgGrey: '#565f89',
    
    // Bright background variants
    bgBrightBlack: '#414868',
    bgBrightRed: '#ff9e64',
    bgBrightGreen: '#73daca',
    bgBrightYellow: '#ffc777',
    bgBrightBlue: '#89ddff',
    bgBrightMagenta: '#ff007c',
    bgBrightCyan: '#b4f9f8',
    bgBrightWhite: '#ffffff',
    
    // Special values
    dim: '#565f89',        // For dimmed text
    none: undefined,       // No color
    default: undefined,    // Use terminal default
} as const;

export type ColorName = keyof typeof COLOR_PALETTE;

/**
 * Check if a string is a valid hex color
 */
export function isHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Check if a string is an ANSI color name
 */
export function isAnsiColorName(color: string): boolean {
    return color in COLOR_PALETTE;
}

/**
 * Convert ANSI color name to RGB hex
 */
export function ansiToHex(color: string | undefined): string | undefined {
    if (!color) return undefined;
    if (isHexColor(color)) return color;
    if (color in COLOR_PALETTE) {
        return COLOR_PALETTE[color as ColorName];
    }
    return undefined;
}

/**
 * Convert a background color to its foreground equivalent
 * For example: bgRed -> red, #f7768e -> #f7768e
 */
export function bgToFg(bgColor: string | undefined): string | undefined {
    if (!bgColor) return undefined;
    
    // If it's a hex color, return as-is
    if (isHexColor(bgColor)) return bgColor;
    
    // If it's a bg color name, convert to fg equivalent
    if (bgColor.startsWith('bg')) {
        const fgName = bgColor.substring(2);
        const fgNameLower = fgName.charAt(0).toLowerCase() + fgName.slice(1);
        return ansiToHex(fgNameLower);
    }
    
    // Otherwise convert to hex if it's a color name
    return ansiToHex(bgColor);
}

/**
 * Apply colors to text using chalk with RGB hex values
 */
export function applyColors(
    text: string, 
    foregroundColor?: string, 
    backgroundColor?: string, 
    bold?: boolean
): string {
    let result = text;
    
    // Convert ANSI names to hex if needed
    const fgHex = ansiToHex(foregroundColor);
    const bgHex = ansiToHex(backgroundColor);
    
    // Apply foreground color
    if (fgHex && fgHex !== 'dim') {
        result = chalk.hex(fgHex)(result);
    }
    
    // Apply background color  
    if (bgHex) {
        result = chalk.bgHex(bgHex)(result);
    }
    
    // Apply bold
    if (bold) {
        result = chalk.bold(result);
    }
    
    // Add reset code at the end if any styling was applied
    // This prevents color bleeding in terminals that don't handle it well
    if (fgHex || bgHex || bold) {
        result = result + '\x1b[0m';
    }
    
    return result;
}

/**
 * Get the default color for a status item type
 */
export function getItemDefaultColor(type: string): string {
    const defaults: Record<string, string> = {
        'model': '#7aa2f7',         // blue
        'git-branch': '#bb9af7',     // magenta
        'git-changes': '#e0af68',    // yellow
        'tokens-input': '#7aa2f7',   // blue
        'tokens-output': '#c0caf5',  // white
        'tokens-cached': '#7dcfff',  // cyan
        'tokens-total': '#7dcfff',   // cyan
        'context-length': '#565f89', // gray
        'context-percentage': '#7aa2f7', // blue
        'context-percentage-usable': '#9ece6a', // green
        'terminal-width': '#7dcfff', // cyan
        'session-clock': '#e0af68',  // yellow
        'version': '#9ece6a',        // green
        'custom-text': '#c0caf5',    // white
        'custom-command': '#e0af68', // yellow
        'separator': '#565f89',      // gray
    };
    
    return defaults[type] || '#c0caf5'; // default to white
}

/**
 * Migrate color settings from ANSI names to RGB hex
 */
export function migrateColorToHex(color: string | undefined): string | undefined {
    if (!color) return undefined;
    
    // Already a hex color
    if (isHexColor(color)) return color;
    
    // Convert ANSI name to hex
    const hex = ansiToHex(color);
    if (hex) return hex;
    
    // If we can't convert, return as-is
    return color;
}

/**
 * Migrate all colors in a settings object
 */
export function migrateSettingsColors(settings: any): any {
    // Deep clone to avoid mutations
    const migrated = JSON.parse(JSON.stringify(settings));
    
    // Migrate line items
    if (migrated.lines && Array.isArray(migrated.lines)) {
        for (const line of migrated.lines) {
            if (Array.isArray(line)) {
                for (const item of line) {
                    if (item.color) {
                        item.color = migrateColorToHex(item.color);
                    }
                    if (item.backgroundColor) {
                        item.backgroundColor = migrateColorToHex(item.backgroundColor);
                    }
                }
            }
        }
    }
    
    // Migrate global overrides
    if (migrated.globalOverrides) {
        for (const key in migrated.globalOverrides) {
            const override = migrated.globalOverrides[key];
            if (override && typeof override === 'object') {
                if (override.color) {
                    override.color = migrateColorToHex(override.color);
                }
                if (override.backgroundColor) {
                    override.backgroundColor = migrateColorToHex(override.backgroundColor);
                }
            }
        }
    }
    
    return migrated;
}

/**
 * Get a list of available colors for the TUI
 */
export function getAvailableColors(): Array<{ name: string; hex: string }> {
    return [
        { name: 'Default', hex: '' },
        { name: 'Black', hex: '#1a1b26' },
        { name: 'Red', hex: '#f7768e' },
        { name: 'Green', hex: '#9ece6a' },
        { name: 'Yellow', hex: '#e0af68' },
        { name: 'Blue', hex: '#7aa2f7' },
        { name: 'Magenta', hex: '#bb9af7' },
        { name: 'Cyan', hex: '#7dcfff' },
        { name: 'White', hex: '#c0caf5' },
        { name: 'Gray', hex: '#565f89' },
        { name: 'Bright Red', hex: '#ff9e64' },
        { name: 'Bright Green', hex: '#73daca' },
        { name: 'Bright Yellow', hex: '#ffc777' },
        { name: 'Bright Blue', hex: '#89ddff' },
        { name: 'Bright Magenta', hex: '#ff007c' },
        { name: 'Bright Cyan', hex: '#b4f9f8' },
    ];
}