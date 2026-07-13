import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import type { ClaudeSettings } from '../types/ClaudeSettings';
import {
    SettingsSchema,
    type InstallationMetadata,
    type Settings
} from '../types/Settings';

import {
    getConfigPath,
    isCustomConfigPath,
    saveInstallationMetadata
} from './config';

// Re-export for backward compatibility
export type { ClaudeSettings };

// Use fs.promises directly
const readFile = fs.promises.readFile;
const writeFile = fs.promises.writeFile;
const mkdir = fs.promises.mkdir;

export const CCSTATUSLINE_COMMANDS = {
    AUTO_NPX: 'npx -y ccstatusline@latest',
    AUTO_BUNX: 'bunx -y ccstatusline@latest',
    GLOBAL: 'ccstatusline',
    // Backward-compatible names for existing callers/tests.
    NPM: 'npx -y ccstatusline@latest',
    BUNX: 'bunx -y ccstatusline@latest',
    SELF_MANAGED: 'ccstatusline'
};

export const PINNED_INSTALL_COMMANDS = {
    NPM: (version: string) => `npm install -g ccstatusline@${version}`,
    BUN: (version: string) => `bun add -g ccstatusline@${version}`
};

export type StatusLineCommandMode = 'auto-npx' | 'auto-bunx' | 'global';

export interface InstallStatusLineOptions {
    commandMode: StatusLineCommandMode;
    supportsRefreshInterval?: boolean;
    installationMetadata?: InstallationMetadata;
    targetPath?: string;
}

export interface PackageCommandAvailability {
    npm: boolean;
    npx: boolean;
    bun: boolean;
    bunx: boolean;
}

export function isKnownCommand(command: string): boolean {
    const prefixes = [CCSTATUSLINE_COMMANDS.AUTO_NPX, CCSTATUSLINE_COMMANDS.AUTO_BUNX, CCSTATUSLINE_COMMANDS.GLOBAL];
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
 * Default Claude-settings file all reads/writes target when no explicit
 * targetPath is given. Becomes scope-aware in the project-mode work
 * (project scope routes to <root>/.claude/settings.local.json).
 */
function defaultTargetPath(): string {
    return getClaudeSettingsPath();
}

/**
 * Creates a backup of the current Claude settings file.
 */
async function backupClaudeSettings(suffix = '.bak', targetPath = defaultTargetPath()): Promise<string | null> {
    const settingsPath = targetPath;
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

interface LoadClaudeSettingsOptions {
    logErrors?: boolean;
    targetPath?: string;
}

export interface ClaudeTargetOptions { targetPath?: string }

export function loadClaudeSettingsSync(options: LoadClaudeSettingsOptions = {}): ClaudeSettings {
    const { logErrors = true, targetPath } = options;
    const settingsPath = targetPath ?? defaultTargetPath();

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
    const { logErrors = true, targetPath } = options;
    const settingsPath = targetPath ?? defaultTargetPath();

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
    settings: ClaudeSettings,
    targetPath = defaultTargetPath()
): Promise<void> {
    const settingsPath = targetPath;
    const dir = path.dirname(settingsPath);

    // Backup settings before overwriting
    await backupClaudeSettings('.bak', settingsPath);

    await mkdir(dir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function isInstalled(options: ClaudeTargetOptions = {}): Promise<boolean> {
    let settings: ClaudeSettings;

    try {
        settings = await loadClaudeSettings({ logErrors: false, targetPath: options.targetPath });
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

function isExecutableAvailable(executable: string): boolean {
    try {
        const command = process.platform === 'win32' ? `where ${executable}` : `which ${executable}`;
        execSync(command, { stdio: 'ignore', windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

export function isNpmAvailable(): boolean {
    return isExecutableAvailable('npm');
}

export function isNpxAvailable(): boolean {
    return isExecutableAvailable('npx');
}

export function isBunAvailable(): boolean {
    return isExecutableAvailable('bun');
}

export function isBunxAvailable(): boolean {
    return isExecutableAvailable('bunx');
}

export function getPackageCommandAvailability(): PackageCommandAvailability {
    return {
        npm: isNpmAvailable(),
        npx: isNpxAvailable(),
        bun: isBunAvailable(),
        bunx: isBunxAvailable()
    };
}

export function getClaudeCodeVersion(): string | null {
    try {
        const output = execSync('claude --version', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: 5000,
            windowsHide: true
        }).trim();
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

export function getBaseCommandForMode(commandMode: StatusLineCommandMode): string {
    switch (commandMode) {
        case 'auto-npx':
            return CCSTATUSLINE_COMMANDS.AUTO_NPX;
        case 'auto-bunx':
            return CCSTATUSLINE_COMMANDS.AUTO_BUNX;
        case 'global':
            return CCSTATUSLINE_COMMANDS.GLOBAL;
    }
}

export function buildStatusLineCommand(commandMode: StatusLineCommandMode): string {
    return buildCommand(getBaseCommandForMode(commandMode));
}

function matchesCommandBase(command: string, baseCommand: string): boolean {
    return command === baseCommand || command.startsWith(`${baseCommand} --config `);
}

function isLocalDevelopmentCommand(command: string): boolean {
    return /(?:^|[\s"'\\/])ccstatusline\.ts(?=$|[\s"'])/.test(command);
}

export function classifyInstallation(
    command: string | null | undefined,
    metadata?: InstallationMetadata
): InstallationMetadata {
    const statusLineCommand = command ?? '';

    if (matchesCommandBase(statusLineCommand, CCSTATUSLINE_COMMANDS.AUTO_NPX)) {
        return {
            method: 'auto-update',
            packageManager: 'npm'
        };
    }

    if (matchesCommandBase(statusLineCommand, CCSTATUSLINE_COMMANDS.AUTO_BUNX)) {
        return {
            method: 'auto-update',
            packageManager: 'bun'
        };
    }

    if (matchesCommandBase(statusLineCommand, CCSTATUSLINE_COMMANDS.GLOBAL)) {
        if (metadata?.method === 'pinned') {
            return metadata;
        }

        return {
            method: 'self-managed',
            packageManager: 'unknown'
        };
    }

    if (isLocalDevelopmentCommand(statusLineCommand)) {
        return {
            method: 'self-managed',
            packageManager: 'unknown'
        };
    }

    return {
        method: 'unknown',
        packageManager: 'unknown'
    };
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

export async function installStatusLine({
    commandMode,
    supportsRefreshInterval = false,
    installationMetadata,
    targetPath
}: InstallStatusLineOptions): Promise<void> {
    const resolvedTarget = targetPath ?? defaultTargetPath();
    let settings: ClaudeSettings;

    const backupPath = await backupClaudeSettings('.orig', resolvedTarget);
    try {
        settings = await loadClaudeSettings({ logErrors: false, targetPath: resolvedTarget });
    } catch {
        const fallbackBackupPath = `${resolvedTarget}.orig`;
        console.error(`Warning: Could not read existing Claude settings. A backup exists at ${backupPath ?? fallbackBackupPath}.`);
        settings = {};
    }

    // Update settings with our status line (confirmation already handled in TUI)
    const existingRefreshInterval = settings.statusLine?.refreshInterval;
    settings.statusLine = {
        type: 'command',
        command: buildStatusLineCommand(commandMode),
        padding: 0
    };

    // Only set refreshInterval if Claude Code version supports it (>=2.1.97)
    if (supportsRefreshInterval) {
        settings.statusLine.refreshInterval = existingRefreshInterval ?? 10;
    }

    await saveClaudeSettings(settings, resolvedTarget);
    if (installationMetadata !== undefined) {
        await saveInstallationMetadata(installationMetadata);
    }

    const savedSettings = await loadSavedSettingsForHookSync();
    if (savedSettings) {
        const { syncWidgetHooks } = await import('./hooks');
        await syncWidgetHooks(savedSettings, { targetPath: resolvedTarget });
    }
}

export async function uninstallStatusLine(options: ClaudeTargetOptions = {}): Promise<void> {
    const resolvedTarget = options.targetPath ?? defaultTargetPath();
    let settings: ClaudeSettings;

    try {
        settings = await loadClaudeSettings({ logErrors: false, targetPath: resolvedTarget });
    } catch {
        console.error('Warning: Could not read existing Claude settings.');
        return; // if we can't read, return... what are we uninstalling?
    }

    if (settings.statusLine) {
        delete settings.statusLine;
        await saveClaudeSettings(settings, resolvedTarget);
    }

    await saveInstallationMetadata(undefined);

    try {
        const { removeManagedHooks } = await import('./hooks');
        await removeManagedHooks({ targetPath: resolvedTarget });
    } catch {
        // Ignore hook cleanup failures during uninstall
    }
}

export async function getExistingStatusLine(options: ClaudeTargetOptions = {}): Promise<string | null> {
    try {
        const settings = await loadClaudeSettings({ logErrors: false, targetPath: options.targetPath });
        return settings.statusLine?.command ?? null;
    } catch {
        return null; // Can't read settings, return null
    }
}

export async function getRefreshInterval(options: ClaudeTargetOptions = {}): Promise<number | null> {
    try {
        const settings = await loadClaudeSettings({ logErrors: false, targetPath: options.targetPath });
        return settings.statusLine?.refreshInterval ?? null;
    } catch {
        return null;
    }
}

export async function setRefreshInterval(interval: number | null, options: ClaudeTargetOptions = {}): Promise<void> {
    let settings: ClaudeSettings;

    try {
        settings = await loadClaudeSettings({ logErrors: false, targetPath: options.targetPath });
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

    await saveClaudeSettings(settings, options.targetPath);
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

const RemoteSessionFileSchema = z.object({
    sessionId: z.string().optional(),
    bridgeSessionId: z.string().nullable().optional()
});

/**
 * Reads the per-PID session manifests Claude Code writes to `<config>/sessions/<pid>.json`
 * and returns whether the session matching `sessionId` currently has a remote-control
 * bridge attached.
 *
 * Claude Code writes one file per running interactive session. The `bridgeSessionId`
 * field is populated when remote control (e.g. the mobile/web bridge) is connected
 * for that session. Matching by `sessionId` ensures the result reflects the *current*
 * session rather than any other concurrent Claude Code process.
 *
 * Claude Code's observed behavior on disconnect: the field is set to `null` (not removed)
 * and the file is rewritten within ~1s, so the on-disconnect transition is reflected
 * promptly at the next status-line refresh.
 *
 * - Returns `null` when the sessions directory is missing or no manifest matches —
 *   widgets should hide themselves in that case rather than render a misleading "off".
 * - Returns `{ enabled: false }` when the manifest exists but `bridgeSessionId` is
 *   missing, `null`, or empty (disconnected).
 * - Returns `{ enabled: true }` when a non-empty `bridgeSessionId` is set.
 */
export function getRemoteControlStatus(sessionId: string | undefined): { enabled: boolean } | null {
    if (!sessionId) {
        return null;
    }

    const sessionsDir = path.join(getClaudeConfigDir(), 'sessions');
    let entries: string[];
    try {
        entries = fs.readdirSync(sessionsDir);
    } catch {
        return null;
    }

    for (const entry of entries) {
        if (!entry.endsWith('.json')) {
            continue;
        }

        let content: string;
        try {
            content = fs.readFileSync(path.join(sessionsDir, entry), 'utf-8');
        } catch {
            continue;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            continue;
        }

        const result = RemoteSessionFileSchema.safeParse(parsed);
        if (!result.success || result.data.sessionId !== sessionId) {
            continue;
        }

        const bridge = result.data.bridgeSessionId;
        return { enabled: typeof bridge === 'string' && bridge.length > 0 };
    }

    return null;
}
