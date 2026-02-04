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

export const CCSTATUSLINE_COMMANDS = {
    NPM: 'npx -y ccstatusline@latest',
    BUNX: 'bunx -y ccstatusline@latest',
    SELF_MANAGED: 'ccstatusline'
};

/**
 * Determines the Claude config directory, checking CLAUDE_CONFIG_DIR environment variable first,
 * then falling back to the default ~/.claude directory.
 */
export function getClaudeConfigDir(): string {
    const envConfigDir = process.env.CLAUDE_CONFIG_DIR;

    if (envConfigDir) {
        try {
            // Validate that the path is absolute and reasonable
            const resolvedPath = path.resolve(envConfigDir);

            // Check if directory exists or can be created
            if (fs.existsSync(resolvedPath)) {
                const stats = fs.statSync(resolvedPath);
                if (stats.isDirectory()) {
                    return resolvedPath;
                }
            } else {
                // Directory doesn't exist yet, but we can try to use it
                // (mkdir will be called later when saving)
                return resolvedPath;
            }
        } catch {
            // Fall through to default on any error
        }
    }

    // Default fallback
    return path.join(os.homedir(), '.claude');
}

/**
 * Gets the full path to the Claude settings.json file.
 */
export function getClaudeSettingsPath(): string {
    return path.join(getClaudeConfigDir(), 'settings.json');
}

/**
 * Creates a backup of the current Claude settings file.
 */
async function backupClaudeSettings(suffix: string = '.bak'): Promise<void> {
    const settingsPath = getClaudeSettingsPath();
    try {
        if (fs.existsSync(settingsPath)) {
            const content = await readFile(settingsPath, 'utf-8');
            await writeFile(settingsPath + suffix, content, 'utf-8');
        }
    } catch (error) {
        console.error('Failed to backup Claude settings:', error);
    }
}

export async function loadClaudeSettings(): Promise<ClaudeSettings> {
    const settingsPath = getClaudeSettingsPath();

    // File doesn't exist - return empty object
    if (!fs.existsSync(settingsPath)) {
        return {};
    }

    try {
        const content = await readFile(settingsPath, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
    } catch (error) {
        // Log and re-throw
        console.error('Failed to load Claude settings:', error);
        throw error;
    }
}

export async function saveClaudeSettings(
    settings: ClaudeSettings
): Promise<void> {
    const settingsPath = getClaudeSettingsPath();
    const dir = path.dirname(settingsPath);

    // Backup settings before overwriting
    await backupClaudeSettings();

    await mkdir(dir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function isInstalled(): Promise<boolean> {
    let settings: ClaudeSettings;

    try {
        settings = await loadClaudeSettings();
    } catch {
        return false; // Can't determine if installed, assume not
    }

    // Check if command is either npx or bunx version AND padding is 0 (or undefined for new installs)
    const validCommands = [
        // Default autoinstalled npm command
        CCSTATUSLINE_COMMANDS.NPM,
        // Default autoinstalled bunx command
        CCSTATUSLINE_COMMANDS.BUNX,
        // Self managed installation command
        CCSTATUSLINE_COMMANDS.SELF_MANAGED
    ];
    return (
        validCommands.includes(settings.statusLine?.command ?? '')
        && (settings.statusLine?.padding === 0
            || settings.statusLine?.padding === undefined)
    );
}

export function isBunxAvailable(): boolean {
    try {
        // Use platform-appropriate command to check for bunx availability
        const command = process.platform === 'win32' ? 'where bunx' : 'which bunx';
        execSync(command, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export async function installStatusLine(useBunx = false): Promise<void> {
    let settings: ClaudeSettings;

    await backupClaudeSettings('.orig');
    try {
        settings = await loadClaudeSettings();
    } catch (error) {
        console.error('Warning: Could not read existing Claude settings. A backup exists.');
        settings = {};
    }

    // Update settings with our status line (confirmation already handled in TUI)
    settings.statusLine = {
        type: 'command',
        command: useBunx
            ? CCSTATUSLINE_COMMANDS.BUNX
            : CCSTATUSLINE_COMMANDS.NPM,
        padding: 0
    };

    await saveClaudeSettings(settings);
}

export async function uninstallStatusLine(): Promise<void> {
    let settings: ClaudeSettings;

    try {
        settings = await loadClaudeSettings();
    } catch (error) {
        console.error('Warning: Could not read existing Claude settings.');
        return; // if we can't read, return... what are we uninstalling?
    }

    if (settings.statusLine) {
        delete settings.statusLine;
        await saveClaudeSettings(settings);
    }
}

export async function getExistingStatusLine(): Promise<string | null> {
    try {
        const settings = await loadClaudeSettings();
        return settings.statusLine?.command ?? null;
    } catch {
        return null; // Can't read settings, return null
    }
}