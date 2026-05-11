import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import type { ClaudeSettings } from '../types/ClaudeSettings';
import {
    SettingsSchema,
    type Settings
} from '../types/Settings';

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
    // Also match local development commands (e.g., "bun run /path/to/ccstatusline.ts")
    return prefixes.some(prefix => command === prefix || command.startsWith(`${prefix} --config `))
        || /(?:^|[\s"'\\/])ccstatusline\.ts(?=$|[\s"'])/.test(command);
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
 * Gets the full path to Claude Code's .claude.json account state file.
 *
 * Claude Code stores this as a sibling of the default ~/.claude directory, but
 * inside CLAUDE_CONFIG_DIR when a valid config directory override is active.
 */
export function getClaudeJsonPath(): string {
    const configDir = getClaudeConfigDir();
    const envConfigDir = process.env.CLAUDE_CONFIG_DIR;

    if (envConfigDir && configDir === path.resolve(envConfigDir)) {
        return path.join(configDir, '.claude.json');
    }

    return path.join(path.dirname(configDir), '.claude.json');
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
async function backupClaudeSettings(suffix = '.bak'): Promise<string | null> {
    const settingsPath = getClaudeSettingsPath();
    const backupPath = settingsPath + suffix;
    try {
        if (fs.existsSync(settingsPath)) {
            const content = await readFile(settingsPath, 'utf-8');
            await writeFile(backupPath, content, 'utf-8');
            return backupPath;
        }
    } catch (error) {
        console.error('Failed to backup Claude settings:', error);
    }

    return null;
}

interface LoadClaudeSettingsOptions { logErrors?: boolean }

export function loadClaudeSettingsSync(options: LoadClaudeSettingsOptions = {}): ClaudeSettings {
    const { logErrors = true } = options;
    const settingsPath = getClaudeSettingsPath();

    // File doesn't exist - return empty object
    if (!fs.existsSync(settingsPath)) {
        return {};
    }

    try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
    } catch (error) {
        if (logErrors) {
            console.error('Failed to load Claude settings:', error);
        }
        throw error;
    }
}

export async function loadClaudeSettings(options: LoadClaudeSettingsOptions = {}): Promise<ClaudeSettings> {
    const { logErrors = true } = options;
    const settingsPath = getClaudeSettingsPath();

    // File doesn't exist - return empty object
    if (!fs.existsSync(settingsPath)) {
        return {};
    }

    try {
        const content = await readFile(settingsPath, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
    } catch (error) {
        if (logErrors) {
            console.error('Failed to load Claude settings:', error);
        }
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
        settings = await loadClaudeSettings({ logErrors: false });
    } catch {
        return false; // Can't determine if installed, assume not
    }
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

export function getClaudeCodeVersion(): string | null {
    try {
        const output = execSync('claude --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 }).trim();
        // Output is like "2.1.97 (Claude Code)" — extract the version number
        const match = /^(\d+\.\d+\.\d+)/.exec(output);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

export function isClaudeCodeVersionAtLeast(minVersion: string): boolean {
    const version = getClaudeCodeVersion();
    if (!version) {
        return false;
    }

    const current = version.split('.').map(Number);
    const minimum = minVersion.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        const c = current[i] ?? 0;
        const m = minimum[i] ?? 0;
        if (c > m) {
            return true;
        }
        if (c < m) {
            return false;
        }
    }

    return true; // equal
}

function buildCommand(baseCommand: string): string {
    if (isCustomConfigPath()) {
        return `${baseCommand} --config ${quotePathIfNeeded(getConfigPath())}`;
    }
    return baseCommand;
}

async function loadSavedSettingsForHookSync(): Promise<Settings | null> {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return null;
    }

    try {
        const content = await readFile(configPath, 'utf-8');
        const parsed = JSON.parse(content) as unknown;
        const result = SettingsSchema.safeParse(parsed);
        if (!result.success) {
            return null;
        }
        return result.data;
    } catch {
        return null;
    }
}

export async function installStatusLine(useBunx = false, supportsRefreshInterval = false): Promise<void> {
    let settings: ClaudeSettings;

    const backupPath = await backupClaudeSettings('.orig');
    try {
        settings = await loadClaudeSettings({ logErrors: false });
    } catch {
        const fallbackBackupPath = `${getClaudeSettingsPath()}.orig`;
        console.error(`Warning: Could not read existing Claude settings. A backup exists at ${backupPath ?? fallbackBackupPath}.`);
        settings = {};
    }

    const baseCommand = useBunx
        ? CCSTATUSLINE_COMMANDS.BUNX
        : CCSTATUSLINE_COMMANDS.NPM;

    // Update settings with our status line (confirmation already handled in TUI)
    const existingRefreshInterval = settings.statusLine?.refreshInterval;
    settings.statusLine = {
        type: 'command',
        command: buildCommand(baseCommand),
        padding: 0
    };

    // Only set refreshInterval if Claude Code version supports it (>=2.1.97)
    if (supportsRefreshInterval) {
        settings.statusLine.refreshInterval = existingRefreshInterval ?? 10;
    }

    await saveClaudeSettings(settings);

    const savedSettings = await loadSavedSettingsForHookSync();
    if (savedSettings) {
        const { syncWidgetHooks } = await import('./hooks');
        await syncWidgetHooks(savedSettings);
    }
}

export async function uninstallStatusLine(): Promise<void> {
    let settings: ClaudeSettings;

    try {
        settings = await loadClaudeSettings({ logErrors: false });
    } catch {
        console.error('Warning: Could not read existing Claude settings.');
        return; // if we can't read, return... what are we uninstalling?
    }

    if (settings.statusLine) {
        delete settings.statusLine;
        await saveClaudeSettings(settings);
    }

    try {
        const { removeManagedHooks } = await import('./hooks');
        await removeManagedHooks();
    } catch {
        // Ignore hook cleanup failures during uninstall
    }
}

export async function getExistingStatusLine(): Promise<string | null> {
    try {
        const settings = await loadClaudeSettings({ logErrors: false });
        return settings.statusLine?.command ?? null;
    } catch {
        return null; // Can't read settings, return null
    }
}

export async function getRefreshInterval(): Promise<number | null> {
    try {
        const settings = await loadClaudeSettings({ logErrors: false });
        return settings.statusLine?.refreshInterval ?? null;
    } catch {
        return null;
    }
}

export async function setRefreshInterval(interval: number | null): Promise<void> {
    let settings: ClaudeSettings;

    try {
        settings = await loadClaudeSettings({ logErrors: false });
    } catch {
        return;
    }

    if (!settings.statusLine) {
        return;
    }

    if (interval === null) {
        delete settings.statusLine.refreshInterval;
    } else {
        settings.statusLine.refreshInterval = interval;
    }

    await saveClaudeSettings(settings);
}

const VoiceConfigSchema = z.object({ enabled: z.boolean().optional() });

function getVoiceConfigCandidatePathsByPriority(cwd: string): string[] {
    const userDir = getClaudeConfigDir();
    const projectDir = path.join(cwd, '.claude');
    // Highest priority first — `getVoiceConfig` returns on the first defined override.
    const candidates = [
        path.join(projectDir, 'settings.local.json'),
        path.join(projectDir, 'settings.json'),
        path.join(userDir, 'settings.local.json'),
        path.join(userDir, 'settings.json')
    ];
    return Array.from(new Set(candidates));
}

interface VoiceLayerResult {
    fileExisted: boolean;
    enabled: boolean | undefined;
}

function tryReadVoiceLayer(filePath: string): VoiceLayerResult {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
        // ENOENT is the common case (file just doesn't exist on this layer);
        // any other I/O error is treated the same — caller has no recovery path.
        const isMissing = (error as NodeJS.ErrnoException).code === 'ENOENT';
        return { fileExisted: !isMissing, enabled: undefined };
    }

    try {
        const parsed = JSON.parse(content) as { voice?: unknown };
        const voice = parsed.voice;
        if (voice === undefined || voice === null) {
            return { fileExisted: true, enabled: undefined };
        }
        const result = VoiceConfigSchema.safeParse(voice);
        return { fileExisted: true, enabled: result.success ? result.data.enabled : undefined };
    } catch {
        // Malformed JSON — file exists but contributes no override.
        return { fileExisted: true, enabled: undefined };
    }
}

/**
 * Reads the effective `voice.enabled` setting from Claude Code's layered configuration.
 *
 * Claude Code merges settings from up to four files, in increasing order of priority:
 *   1. <user>/settings.json
 *   2. <user>/settings.local.json
 *   3. <cwd>/.claude/settings.json
 *   4. <cwd>/.claude/settings.local.json
 *
 * The user dir respects `CLAUDE_CONFIG_DIR` (fallback `~/.claude`).
 * Lookup walks layers from highest priority to lowest and returns on the first
 * one that defines `voice.enabled` — so the typical case (one file with the field)
 * costs a single read instead of four.
 *
 * - Returns `null` if no candidate file exists (Claude Code never initialised).
 * - Returns `{ enabled: false }` if files exist but none defines `voice.enabled`
 *   (Claude Code's default — `/voice` not yet touched).
 * - Returns `{ enabled: <bool> }` reflecting the highest-priority override otherwise.
 *
 * The `voice.mode` (`hold` / `toggle`) field is not exposed; widgets only need the on/off state.
 */
export function getVoiceConfig(cwd: string = process.cwd()): { enabled: boolean } | null {
    let anyFileExisted = false;
    for (const filePath of getVoiceConfigCandidatePathsByPriority(cwd)) {
        const layer = tryReadVoiceLayer(filePath);
        if (layer.fileExisted) {
            anyFileExisted = true;
        }
        if (layer.enabled !== undefined) {
            return { enabled: layer.enabled };
        }
    }
    return anyFileExisted ? { enabled: false } : null;
}
