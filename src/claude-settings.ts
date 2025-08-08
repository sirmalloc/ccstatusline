import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

// Ensure fs.promises compatibility
const readFile = fs.promises?.readFile || promisify(fs.readFile);
const writeFile = fs.promises?.writeFile || promisify(fs.writeFile);
const mkdir = fs.promises?.mkdir || promisify(fs.mkdir);

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

interface ClaudeSettings {
    permissions?: {
        allow?: string[];
        deny?: string[];
    };
    statusLine?: {
        type: string;
        command: string;
        padding?: number;
    };
    [key: string]: any;
}

export async function loadClaudeSettings(): Promise<ClaudeSettings> {
    try {
        if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
            return {};
        }
        const content = await readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
        return JSON.parse(content);
    } catch {
        return {};
    }
}

export async function saveClaudeSettings(settings: ClaudeSettings): Promise<void> {
    const dir = path.dirname(CLAUDE_SETTINGS_PATH);
    await mkdir(dir, { recursive: true });
    await writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function isInstalled(): Promise<boolean> {
    const settings = await loadClaudeSettings();
    // Check if command is correct AND padding is 0 (or undefined for new installs)
    return settings.statusLine?.command === 'npx -y ccstatusline@latest' && 
           (settings.statusLine.padding === 0 || settings.statusLine.padding === undefined);
}

export async function installStatusLine(): Promise<void> {
    const settings = await loadClaudeSettings();

    // Update settings with our status line (confirmation already handled in TUI)
    settings.statusLine = {
        type: 'command',
        command: 'npx -y ccstatusline@latest',
        padding: 0
    };

    await saveClaudeSettings(settings);
}

export async function uninstallStatusLine(): Promise<void> {
    const settings = await loadClaudeSettings();

    if (settings.statusLine) {
        delete settings.statusLine;
        await saveClaudeSettings(settings);
    }
}

export async function getExistingStatusLine(): Promise<string | null> {
    const settings = await loadClaudeSettings();
    return settings.statusLine?.command || null;
}