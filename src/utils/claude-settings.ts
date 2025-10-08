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

export async function loadClaudeSettings(): Promise<ClaudeSettings> {
    try {
        const settingsPath = getClaudeSettingsPath();
        if (!fs.existsSync(settingsPath)) {
            return {};
        }
        const content = await readFile(settingsPath, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
    } catch {
        return {};
    }
}

export async function saveClaudeSettings(
    settings: ClaudeSettings
): Promise<void> {
    const settingsPath = getClaudeSettingsPath();
    const dir = path.dirname(settingsPath);
    await mkdir(dir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function isInstalled(): Promise<boolean> {
    const settings = await loadClaudeSettings();
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
    const settings = await loadClaudeSettings();

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