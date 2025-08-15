import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
    ColorLevelString,
    LegacySettings,
    PartialSettings,
    Settings,
    StatusItem
} from '../types';

// Re-export types for backward compatibility
export type { StatusItem, StatusItemType } from '../types';
export type { ColorLevelString, FlexMode, LegacySettings, PartialSettings, PowerlineConfig, Settings } from '../types';

// Use fs.promises directly (always available in modern Node.js)
const readFile = fs.promises.readFile;
const writeFile = fs.promises.writeFile;
const mkdir = fs.promises.mkdir;

const CONFIG_DIR = path.join(os.homedir(), '.config', 'ccstatusline');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');

// Centralized defaults - NEVER use inline defaults, always reference these
export const DEFAULT_SETTINGS: Settings = {
    lines: [
        [
            {
                id: '1',
                type: 'model',
                color: 'cyan'
            },
            {
                id: '2',
                type: 'separator'
            },
            {
                id: '3',
                type: 'context-length',
                color: 'brightBlack'
            },
            {
                id: '4',
                type: 'separator'
            },
            {
                id: '5',
                type: 'git-branch',
                color: 'magenta'
            },
            {
                id: '6',
                type: 'separator'
            },
            {
                id: '7',
                type: 'git-changes',
                color: 'yellow'
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
        lines: settings.lines ?? DEFAULT_SETTINGS.lines,
        flexMode: settings.flexMode ?? DEFAULT_SETTINGS.flexMode,
        compactThreshold: settings.compactThreshold ?? DEFAULT_SETTINGS.compactThreshold,
        colorLevel: settings.colorLevel ?? DEFAULT_SETTINGS.colorLevel,
        defaultSeparator: settings.defaultSeparator,
        defaultPadding: settings.defaultPadding,
        inheritSeparatorColors: settings.inheritSeparatorColors ?? DEFAULT_SETTINGS.inheritSeparatorColors,
        overrideBackgroundColor: settings.overrideBackgroundColor,
        overrideForegroundColor: settings.overrideForegroundColor,
        globalBold: settings.globalBold ?? DEFAULT_SETTINGS.globalBold,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(settings.powerline ?? {})
        }
    };

    return normalized;
}

// Helper to get color level as string for chalk

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
        let loaded: LegacySettings;

        try {
            loaded = JSON.parse(content) as LegacySettings;
        } catch {
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
        return normalizeSettings(loaded as PartialSettings);
    } catch (error) {
        // Any other error, return defaults
        console.error('Error loading settings:', error);
        return normalizeSettings({});
    }
}

function migrateOldSettings(old: LegacySettings): PartialSettings {
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
        items.forEach((item) => {
            if (item.type === 'separator') {
                item.type = 'flex-separator';
            }
        });
    }

    return {
        lines: [items], // Put migrated items in first line
        flexMode: DEFAULT_SETTINGS.flexMode,
        compactThreshold: DEFAULT_SETTINGS.compactThreshold
    };
}

export async function saveSettings(settings: Settings): Promise<void> {
    // Ensure config directory exists
    await mkdir(CONFIG_DIR, { recursive: true });

    // Write settings using Node.js-compatible API
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}