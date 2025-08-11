import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

// Ensure fs.promises compatibility
const readFile = fs.promises?.readFile || promisify(fs.readFile);
const writeFile = fs.promises?.writeFile || promisify(fs.writeFile);
const mkdir = fs.promises?.mkdir || promisify(fs.mkdir);

export type StatusItemType = 'model' | 'git-branch' | 'git-changes' | 'separator' | 'flex-separator' |
    'tokens-input' | 'tokens-output' | 'tokens-cached' | 'tokens-total' | 'context-length' | 'context-percentage' | 'terminal-width' | 'session-clock' | 'version' | 'custom-text' | 'custom-command';

export interface StatusItem {
    id: string;
    type: StatusItemType;
    color?: string;
    character?: string; // For separator and flex-separator types
    rawValue?: boolean; // Show value without label prefix
    customText?: string; // For custom-text type
    commandPath?: string; // For custom-command type - the command to execute
    maxWidth?: number; // For custom-command type - max width of output
    preserveColors?: boolean; // For custom-command type - preserve ANSI colors from command output
    timeout?: number; // For custom-command type - timeout in milliseconds (default: 1000)
}

export type FlexMode = 'full' | 'full-minus-40' | 'full-until-compact';

export interface Settings {
    items?: StatusItem[]; // Legacy single line support
    lines?: StatusItem[][]; // Multiple lines (up to 3)
    colors: {
        model: string;
        gitBranch: string;
        separator: string;
    };
    flexMode?: FlexMode; // How to handle terminal width for flex separators
    compactThreshold?: number; // Context percentage (50-99) for 'full-until-compact' mode
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'ccstatusline');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');

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
                "color": "dim"
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
    colors: {
        model: 'cyan',
        gitBranch: 'magenta',
        separator: 'dim',
    },
    flexMode: 'full-minus-40',
    compactThreshold: 60,
};

export async function loadSettings(): Promise<Settings> {
    try {
        // Use Node.js-compatible file reading
        if (!fs.existsSync(SETTINGS_PATH)) {
            return DEFAULT_SETTINGS;
        }

        const content = await readFile(SETTINGS_PATH, 'utf-8');
        let loaded: any;

        try {
            loaded = JSON.parse(content);
        } catch (parseError) {
            // If we can't parse the settings, return defaults
            console.error('Failed to parse settings.json, using defaults');
            return DEFAULT_SETTINGS;
        }

        // Migrate from old format with elements/layout
        if (loaded.elements || loaded.layout) {
            return migrateOldSettings(loaded);
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

        return { ...DEFAULT_SETTINGS, ...loaded };
    } catch (error) {
        // Any other error, return defaults
        console.error('Error loading settings:', error);
        return DEFAULT_SETTINGS;
    }
}

function migrateOldSettings(old: any): Settings {
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
        colors: old.colors || DEFAULT_SETTINGS.colors,
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