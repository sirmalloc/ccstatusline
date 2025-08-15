import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

// Ensure fs.promises compatibility
const readFile = fs.promises?.readFile || promisify(fs.readFile);
const writeFile = fs.promises?.writeFile || promisify(fs.writeFile);
const mkdir = fs.promises?.mkdir || promisify(fs.mkdir);

export type StatusItemType = 'model' | 'git-branch' | 'git-changes' | 'separator' | 'flex-separator' |
    'tokens-input' | 'tokens-output' | 'tokens-cached' | 'tokens-total' | 'context-length' | 'context-percentage' | 'context-percentage-usable' | 'terminal-width' | 'session-clock' | 'version' | 'custom-text' | 'custom-command';

export interface StatusItem {
    id: string;
    type: StatusItemType;
    color?: string;
    backgroundColor?: string; // Background color for the item
    bold?: boolean; // Bold text styling
    character?: string; // For separator and flex-separator types
    rawValue?: boolean; // Show value without label prefix
    customText?: string; // For custom-text type
    commandPath?: string; // For custom-command type - the command to execute
    maxWidth?: number; // For custom-command type - max width of output
    preserveColors?: boolean; // For custom-command type - preserve ANSI colors from command output
    timeout?: number; // For custom-command type - timeout in milliseconds (default: 1000)
    merge?: boolean | 'no-padding'; // Merge with next item: true = merge with padding, 'no-padding' = merge without padding
}

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
    compactThreshold: number; // Context percentage (50-99) for 'full-until-compact' mode
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

const CONFIG_DIR = path.join(os.homedir(), '.config', 'ccstatusline');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');

// Centralized defaults - NEVER use inline defaults, always reference these
export const DEFAULT_SETTINGS: Settings = {
    lines: [
        [
            {
                "id": "1",
                "type": "model",
                "color": "cyan"
            },
            {
                "id": "2",
                "type": "separator"
            },
            {
                "id": "3",
                "type": "context-length",
                "color": "brightBlack"
            },
            {
                "id": "4",
                "type": "separator"
            },
            {
                "id": "5",
                "type": "git-branch",
                "color": "magenta"
            },
            {
                "id": "6",
                "type": "separator"
            },
            {
                "id": "7",
                "type": "git-changes",
                "color": "yellow"
            }
        ]
    ],
    flexMode: 'full-minus-40',
    compactThreshold: 60,
    colorLevel: 2, // Default to 256 colors
    defaultSeparator: undefined,
    defaultPadding: undefined,
    inheritSeparatorColors: false,
    overrideBackgroundColor: undefined,
    overrideForegroundColor: undefined,
    globalBold: false,
    powerline: {
        enabled: false,
        separator: '\uE0B0',
        startCap: '',
        endCap: ''
    }
};

// Helper function to ensure settings have all required values
export function normalizeSettings(settings: PartialSettings): Settings {
    // Deep merge with defaults to ensure all values are present
    const normalized: Settings = {
        lines: settings.lines || DEFAULT_SETTINGS.lines,
        flexMode: settings.flexMode || DEFAULT_SETTINGS.flexMode,
        compactThreshold: settings.compactThreshold || DEFAULT_SETTINGS.compactThreshold,
        colorLevel: settings.colorLevel !== undefined ? settings.colorLevel : DEFAULT_SETTINGS.colorLevel,
        defaultSeparator: settings.defaultSeparator,
        defaultPadding: settings.defaultPadding,
        inheritSeparatorColors: settings.inheritSeparatorColors !== undefined ? settings.inheritSeparatorColors : DEFAULT_SETTINGS.inheritSeparatorColors,
        overrideBackgroundColor: settings.overrideBackgroundColor,
        overrideForegroundColor: settings.overrideForegroundColor,
        globalBold: settings.globalBold !== undefined ? settings.globalBold : DEFAULT_SETTINGS.globalBold,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(settings.powerline || {})
        }
    };
    
    return normalized;
}

// Helper to get color level as string for chalk
export type ColorLevelString = 'ansi16' | 'ansi256' | 'truecolor';

export function getColorLevelString(level: 0 | 1 | 2 | 3 | undefined): ColorLevelString {
    switch (level) {
        case 0:
        case 1:
            return 'ansi16';
        case 3:
            return 'truecolor';
        case 2:
        default:
            return 'ansi256';
    }
}

export async function loadSettings(): Promise<Settings> {
    try {
        // Use Node.js-compatible file reading
        if (!fs.existsSync(SETTINGS_PATH)) {
            return normalizeSettings({});
        }

        const content = await readFile(SETTINGS_PATH, 'utf-8');
        let loaded: any;

        try {
            loaded = JSON.parse(content);
        } catch (parseError) {
            // If we can't parse the settings, return defaults
            console.error('Failed to parse settings.json, using defaults');
            return normalizeSettings({});
        }

        // Migrate from old format with elements/layout
        if (loaded.elements || loaded.layout) {
            return normalizeSettings(migrateOldSettings(loaded));
        }

        // Migrate from single items array to lines array
        if (loaded.items && !loaded.lines) {
            loaded.lines = [loaded.items];
            delete loaded.items;
        }

        // Ensure lines is an array and limit to 3 lines
        if (loaded.lines) {
            if (!Array.isArray(loaded.lines)) {
                loaded.lines = [[]];
            }
            loaded.lines = loaded.lines.slice(0, 3);
        }

        // Use normalizeSettings to ensure all values are present
        return normalizeSettings(loaded);
    } catch (error) {
        // Any other error, return defaults
        console.error('Error loading settings:', error);
        return normalizeSettings({});
    }
}

function migrateOldSettings(old: any): PartialSettings {
    const items: StatusItem[] = [];
    let id = 1;

    if (old.elements?.model) {
        items.push({ id: String(id++), type: 'model', color: old.colors?.model });
    }

    if (items.length > 0 && old.elements?.gitBranch) {
        items.push({ id: String(id++), type: 'separator' });
    }

    if (old.elements?.gitBranch) {
        items.push({ id: String(id++), type: 'git-branch', color: old.colors?.gitBranch });
    }

    if (old.layout?.expandingSeparators) {
        // Replace regular separators with flex separators
        items.forEach(item => {
            if (item.type === 'separator') {
                item.type = 'flex-separator';
            }
        });
    }

    return {
        lines: [items], // Put migrated items in first line
        flexMode: DEFAULT_SETTINGS.flexMode,
        compactThreshold: DEFAULT_SETTINGS.compactThreshold,
    };
}

export async function saveSettings(settings: Settings): Promise<void> {
    // Ensure config directory exists
    await mkdir(CONFIG_DIR, { recursive: true });

    // Write settings using Node.js-compatible API
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}