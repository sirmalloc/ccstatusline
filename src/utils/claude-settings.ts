import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ClaudeSettings } from '../types/ClaudeSettings';

// Re-export for backward compatibility
export type { ClaudeSettings };

// Use fs.promises directly
const readFile = fs.promises.readFile;
const writeFile = fs.promises.writeFile;
const mkdir = fs.promises.mkdir;

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

export async function loadClaudeSettings(): Promise<ClaudeSettings> {
    try {
        if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
            return {};
        }
        const content = await readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
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
    // Check if command is either npx or bunx version AND padding is 0 (or undefined for new installs)
    const validCommands = ['npx -y ccstatusline@latest', 'bunx -y ccstatusline@latest'];
    return validCommands.includes(settings.statusLine?.command ?? '')
        && (settings.statusLine?.padding === 0 || settings.statusLine?.padding === undefined);
}

export function isBunxAvailable(): boolean {
    try {
        execSync('which bunx', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export async function installStatusLine(useBunx = false): Promise<void> {
    const settings = await loadClaudeSettings();

    // Update settings with our status line (confirmation already handled in TUI)
    settings.statusLine = {
        type: 'command',
        command: useBunx ? 'bunx -y ccstatusline@latest' : 'npx -y ccstatusline@latest',
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
    return settings.statusLine?.command ?? null;
}