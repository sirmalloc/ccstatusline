import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ClaudeSettings } from '../types/ClaudeSettings';

import {
    getConfigPath,
    isCustomConfigPath
} from './config';

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

export function isKnownCommand(command: string): boolean {
    const prefixes = [CCSTATUSLINE_COMMANDS.NPM, CCSTATUSLINE_COMMANDS.BUNX, CCSTATUSLINE_COMMANDS.SELF_MANAGED];
    return prefixes.some(prefix => command === prefix || command.startsWith(`${prefix} --config `));
}

function needsQuoting(filePath: string): boolean {
    if (process.platform === 'win32') {
        // cmd.exe-safe set of characters that require quoting.
        return /[\s&()<>|^"]/.test(filePath);
    }

    return /[\s()[\];&#|'"\\$`]/.test(filePath);
}

function quotePathIfNeeded(filePath: string): string {
    if (!needsQuoting(filePath)) {
        return filePath;
    }

    if (process.platform === 'win32') {
        return `"${filePath.replace(/"/g, '""')}"`;
    }

    return `'${filePath.replace(/'/g, '\'\\\'\'')}'`;
}

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
    const command = settings.statusLine?.command ?? '';
    return (
        isKnownCommand(command)
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

function buildCommand(baseCommand: string): string {
    if (isCustomConfigPath()) {
        return `${baseCommand} --config ${quotePathIfNeeded(getConfigPath())}`;
    }
    return baseCommand;
}

export async function installStatusLine(useBunx = false): Promise<void> {
    const settings = await loadClaudeSettings();

    const baseCommand = useBunx
        ? CCSTATUSLINE_COMMANDS.BUNX
        : CCSTATUSLINE_COMMANDS.NPM;

    // Update settings with our status line (confirmation already handled in TUI)
    settings.statusLine = {
        type: 'command',
        command: buildCommand(baseCommand),
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
