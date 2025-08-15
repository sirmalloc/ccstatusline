import type { WidgetItem } from './Widget';

export type FlexMode = 'full' | 'full-minus-40' | 'full-until-compact';

export interface PowerlineConfig {
    enabled?: boolean; // Whether powerline mode is enabled
    separators?: string[]; // Array of powerline separator characters (cycles through)
    separatorInvertBackground?: boolean[]; // Whether to invert fg/bg for each separator
    startCaps?: string[]; // Array of start cap characters (cycles through lines, max 3)
    endCaps?: string[]; // Array of end cap characters (cycles through lines, max 3)
    theme?: string; // Theme name ('nord', 'monokai', etc.) or 'custom' for manual colors
}

// Settings with all required fields - no optionals
// This is what we use internally after normalization
export interface Settings {
    lines: WidgetItem[][]; // Multiple lines (up to 3)
    flexMode: FlexMode; // How to handle terminal width for flex separators
    compactThreshold: number; // Context percentage (1-99) for 'full-until-compact' mode
    defaultSeparator?: string; // Default separator character to insert between widgets
    defaultPadding?: string; // Default padding to add around all widgets
    inheritSeparatorColors: boolean; // Whether default separators inherit colors from preceding widget
    overrideBackgroundColor?: string; // Override background color for all widgets (e.g., 'none', 'bgRed', etc.)
    overrideForegroundColor?: string; // Override foreground color for all widgets (e.g., 'red', 'cyan', etc.)
    globalBold: boolean; // Apply bold formatting to all widgets
    powerline: PowerlineConfig; // Powerline mode configuration
    colorLevel: 0 | 1 | 2 | 3; // Chalk color level: 0=none, 1=basic, 2=256, 3=truecolor (default)
}

// Partial settings as loaded from disk (may have missing fields)
export interface PartialSettings {
    items?: WidgetItem[]; // Legacy single line support
    lines?: WidgetItem[][]; // Multiple lines (up to 3)
    flexMode?: FlexMode;
    compactThreshold?: number;
    defaultSeparator?: string;
    defaultPadding?: string;
    inheritSeparatorColors?: boolean;
    overrideBackgroundColor?: string;
    overrideForegroundColor?: string;
    globalBold?: boolean;
    powerline?: PowerlineConfig;
    colorLevel?: 0 | 1 | 2 | 3;
}

export type ColorLevelString = 'ansi16' | 'ansi256' | 'truecolor';

// Type for legacy settings format
export interface LegacySettings {
    elements?: { model?: boolean; gitBranch?: boolean };
    layout?: { expandingSeparators?: boolean };
    colors?: { model?: string; gitBranch?: string };
    items?: WidgetItem[];
    lines?: WidgetItem[][];
    [key: string]: unknown;
}