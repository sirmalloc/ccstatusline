import type { StatusItem } from './StatusItem';

export type FlexMode = 'full' | 'full-minus-40' | 'full-until-compact';

export interface PowerlineConfig {
    enabled?: boolean; // Whether powerline mode is enabled
    separator?: string; // Powerline separator character (default: \uE0B0)
    startCap?: string; // Optional start cap character
    endCap?: string; // Optional end cap character
}

// Settings with all required fields - no optionals
// This is what we use internally after normalization
export interface Settings {
    lines: StatusItem[][]; // Multiple lines (up to 3)
    flexMode: FlexMode; // How to handle terminal width for flex separators
    compactThreshold: number; // Context percentage (1-99) for 'full-until-compact' mode
    defaultSeparator?: string; // Default separator character to insert between items
    defaultPadding?: string; // Default padding to add around all items
    inheritSeparatorColors: boolean; // Whether default separators inherit colors from preceding widget
    overrideBackgroundColor?: string; // Override background color for all items (e.g., 'none', 'bgRed', etc.)
    overrideForegroundColor?: string; // Override foreground color for all items (e.g., 'red', 'cyan', etc.)
    globalBold: boolean; // Apply bold formatting to all items
    powerline: PowerlineConfig; // Powerline mode configuration
    colorLevel: 0 | 1 | 2 | 3; // Chalk color level: 0=none, 1=basic, 2=256, 3=truecolor (default)
}

// Partial settings as loaded from disk (may have missing fields)
export interface PartialSettings {
    items?: StatusItem[]; // Legacy single line support
    lines?: StatusItem[][]; // Multiple lines (up to 3)
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
    items?: StatusItem[];
    lines?: StatusItem[][];
    [key: string]: unknown;
}