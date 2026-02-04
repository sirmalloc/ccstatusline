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
 * Finds the package root directory by searching upward for package.json.
 * This works whether running from source or from a bundled package.
 */
function findPackageRoot(): string {
    let currentDir = __dirname;

    // Search upward until we find package.json
    while (currentDir !== path.dirname(currentDir)) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }

    // Fallback: if we can't find package.json, assume we're in a standard npm package structure
    // This handles the case where the code is bundled and __dirname points to dist/
    return path.join(__dirname, '..');
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

/**
 * Gets the full path to the Claude hooks directory.
 */
export function getClaudeHooksDir(): string {
    return path.join(getClaudeConfigDir(), 'hooks');
}

/**
 * Gets the full path to the timing hook script.
 */
export function getTimingHookPath(): string {
    return path.join(getClaudeHooksDir(), 'timing_hook.sh');
}

/**
 * Checks if the task timer hooks are installed.
 */
export async function isTaskTimerInstalled(): Promise<boolean> {
    // Check if timing_hook.sh exists
    const hookPath = getTimingHookPath();
    if (!fs.existsSync(hookPath)) {
        return false;
    }

    // Check if hooks are configured in settings.json
    const settings = await loadClaudeSettings();
    const hooks = settings.hooks as Record<string, unknown> | undefined;

    if (!hooks) {
        return false;
    }

    // Check for UserPromptSubmit, Stop, and SessionEnd hooks
    const requiredHooks = ['UserPromptSubmit', 'Stop', 'SessionEnd'];
    for (const hookName of requiredHooks) {
        const hookConfig = hooks[hookName] as { hooks: { command: string }[] }[] | undefined;
        if (!hookConfig || !Array.isArray(hookConfig)) {
            return false;
        }

        // Check if timing_hook.sh is present in the hook configuration
        const hasTimingHook = hookConfig.some((config) => {
            const hooksList = config.hooks;
            if (!Array.isArray(hooksList)) {
                return false;
            }
            return hooksList.some((hook) => {
                return hook.command.includes('timing_hook.sh');
            });
        });

        if (!hasTimingHook) {
            return false;
        }
    }

    return true;
}

/**
 * Installs the task timer hooks.
 * Copies timing_hook.sh to ~/.claude/hooks/ and updates settings.json
 */
export async function installTaskTimer(): Promise<void> {
    // Create hooks directory
    const hooksDir = getClaudeHooksDir();
    await mkdir(hooksDir, { recursive: true });

    // Copy timing_hook.sh from templates
    // Use findPackageRoot() to locate templates directory reliably
    const packageRoot = findPackageRoot();
    const templatePath = path.join(packageRoot, 'templates', 'hooks', 'timing_hook.sh');
    const hookPath = getTimingHookPath();

    // Read template and write to hooks directory
    const templateContent = await readFile(templatePath, 'utf-8');
    await writeFile(hookPath, templateContent, 'utf-8');

    // Make script executable on Unix-like systems
    if (process.platform !== 'win32') {
        fs.chmodSync(hookPath, 0o755);
    }

    // Update settings.json with hooks configuration
    const settings = await loadClaudeSettings();

    // Get platform-specific hook command
    const hookCommand = getTimingHookCommand();

    // Initialize hooks object if it doesn't exist
    settings.hooks ??= {};

    const hooks = settings.hooks as Record<string, { hooks: { command: string; type: string }[] }[]>;

    // Helper to add hook if not already present
    const addHook = (hookName: string) => {
        hooks[hookName] ??= [];

        // Check if timing_hook.sh already exists
        const hasTimingHook = hooks[hookName].some((config) => {
            return config.hooks.some(hook => hook.command.includes('timing_hook.sh'));
        });

        if (!hasTimingHook) {
            hooks[hookName].push({
                hooks: [
                    {
                        command: hookCommand,
                        type: 'command'
                    }
                ]
            });
        }
    };

    // Add hooks for UserPromptSubmit, Stop, and SessionEnd
    addHook('UserPromptSubmit');
    addHook('Stop');
    addHook('SessionEnd');

    await saveClaudeSettings(settings);
}

/**
 * Uninstalls the task timer hooks.
 * Removes timing_hook.sh and cleans up hooks configuration
 */
export async function uninstallTaskTimer(): Promise<void> {
    // Remove timing_hook.sh
    const hookPath = getTimingHookPath();
    if (fs.existsSync(hookPath)) {
        await fs.promises.unlink(hookPath);
    }

    // Update settings.json to remove hooks
    const settings = await loadClaudeSettings();
    if (!settings.hooks) {
        return;
    }

    const hooks = settings.hooks as Record<string, { hooks: { command: string }[] }[]>;

    // Remove timing_hook.sh from all hooks
    const hookNames = ['UserPromptSubmit', 'Stop', 'SessionEnd'];
    for (const hookName of hookNames) {
        if (!hooks[hookName]) {
            continue;
        }

        const filtered = hooks[hookName].filter((config) => {
            config.hooks = config.hooks.filter((hook) => {
                return !hook.command.includes('timing_hook.sh');
            });
            return config.hooks.length > 0;
        });

        // Remove empty hook arrays or update
        if (filtered.length === 0) {
            hooks[hookName] = undefined as unknown as { hooks: { command: string }[] }[];
        } else {
            hooks[hookName] = filtered;
        }
    }

    // Remove hooks object if empty
    if (Object.keys(hooks).length === 0) {
        delete settings.hooks;
    }

    await saveClaudeSettings(settings);
}

/**
 * Gets the platform-specific command to execute timing_hook.sh
 */
function getTimingHookCommand(): string {
    const hookPath = getTimingHookPath();

    if (process.platform === 'win32') {
        // Windows: Use %USERPROFILE% environment variable
        const relativePath = hookPath.replace(
            path.join(os.homedir(), '.claude'),
            '%USERPROFILE%\\.claude'
        ).replace(/\\/g, '\\\\');
        return `bash "${relativePath}"`;
    } else {
        // Unix-like systems: Use $HOME environment variable
        const relativePath = hookPath.replace(os.homedir(), '$HOME');
        return `bash "${relativePath}"`;
    }
}