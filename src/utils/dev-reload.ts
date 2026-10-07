import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    SettingsSchema,
    type Settings
} from '../types/Settings';

// Development aid: with CCSTATUSLINE_DEV_RELOAD=1 the interactive TUI runs
// under a small supervisor, and ctrl+r restarts it in place (new code, same
// unsaved settings and screen). Nothing here runs unless the variable is set.
export const DEV_RELOAD_ENV = 'CCSTATUSLINE_DEV_RELOAD';
export const DEV_RELOAD_STATE_ENV = 'CCSTATUSLINE_DEV_RELOAD_STATE';
// EX_TEMPFAIL: "try again", which is what the supervisor does
export const DEV_RELOAD_EXIT_CODE = 75;

export type DevReloadMode = 'off' | 'supervisor' | 'child';

export function getDevReloadMode(env: NodeJS.ProcessEnv): DevReloadMode {
    if (env[DEV_RELOAD_ENV] !== '1') {
        return 'off';
    }

    return env[DEV_RELOAD_STATE_ENV] ? 'child' : 'supervisor';
}

export function getDevReloadStateFile(env: NodeJS.ProcessEnv): string | null {
    return getDevReloadMode(env) === 'child' ? env[DEV_RELOAD_STATE_ENV] ?? null : null;
}

// Screens that need nothing beyond the snapshot to render. Confirm dialogs,
// install/update flows and import/export carry state of their own, so a
// reload from one of them lands on the main menu instead.
export const RESTORABLE_SCREENS = [
    'main',
    'lines',
    'items',
    'colorLines',
    'colors',
    'terminalWidth',
    'terminalConfig',
    'globalOverrides',
    'powerline'
] as const;
export type RestorableScreen = typeof RESTORABLE_SCREENS[number];

export interface DevReloadSnapshot {
    settings: Settings;
    // Kept so the unsaved-changes state and ctrl+s behave as before the reload
    originalSettings: Settings;
    screen: string;
    selectedLine: number;
    menuSelections: Record<string, number>;
    itemsCursor: number;
}

export type RestoredDevReloadSnapshot = DevReloadSnapshot & { screen: RestorableScreen };

function toRestorableScreen(screen: unknown): RestorableScreen {
    return RESTORABLE_SCREENS.find(restorable => restorable === screen) ?? 'main';
}

function toCount(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function writeDevReloadSnapshot(stateFile: string, snapshot: DevReloadSnapshot): void {
    fs.writeFileSync(stateFile, JSON.stringify(snapshot), 'utf-8');
}

// Null when there is nothing usable to restore; the TUI then loads normally.
// Settings are re-validated because the reload may have changed the schema.
export function readDevReloadSnapshot(stateFile: string): RestoredDevReloadSnapshot | null {
    let raw: unknown;
    try {
        raw = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch {
        return null;
    }

    if (typeof raw !== 'object' || raw === null) {
        return null;
    }

    const candidate = raw as Partial<Record<keyof DevReloadSnapshot, unknown>>;
    const settings = SettingsSchema.safeParse(candidate.settings);
    const originalSettings = SettingsSchema.safeParse(candidate.originalSettings);
    if (!settings.success || !originalSettings.success) {
        return null;
    }

    const menuSelections = typeof candidate.menuSelections === 'object' && candidate.menuSelections !== null
        ? Object.fromEntries(Object.entries(candidate.menuSelections).map(([key, value]) => [key, toCount(value)]))
        : {};

    return {
        settings: settings.data,
        originalSettings: originalSettings.data,
        screen: toRestorableScreen(candidate.screen),
        selectedLine: toCount(candidate.selectedLine),
        menuSelections,
        itemsCursor: toCount(candidate.itemsCursor)
    };
}

export function removeDevReloadSnapshot(stateFile: string): void {
    fs.rmSync(stateFile, { force: true });
}

// Set by the TUI when ctrl+r is pressed; read once Ink has unmounted so the
// process can exit with the reload code instead of a normal exit
let reloadRequested = false;

export function requestDevReload(): void {
    reloadRequested = true;
}

export function isDevReloadRequested(): boolean {
    return reloadRequested;
}

export interface DevReloadSupervisorDeps {
    // Runs the TUI to completion and returns its exit code
    launch: () => number;
    // Asked after a crash; true relaunches, false gives up
    promptRetry: (exitCode: number) => Promise<boolean>;
    cleanup: () => void;
}

export async function runDevReloadSupervisor(deps: DevReloadSupervisorDeps): Promise<number> {
    for (;;) {
        const exitCode = deps.launch();
        if (exitCode === DEV_RELOAD_EXIT_CODE) {
            continue;
        }

        if (exitCode === 0 || !(await deps.promptRetry(exitCode))) {
            deps.cleanup();
            return exitCode;
        }
    }
}

function promptRetryOnTerminal(exitCode: number): Promise<boolean> {
    process.stdout.write(`\nReload failed (exit ${exitCode}). Fix the code, then press Enter to retry, or q to quit.\n`);

    return new Promise((resolve) => {
        const stdin = process.stdin;
        const onData = (data: Buffer) => {
            const key = data.toString();
            const retry = key === '\r' || key === '\n';
            const quit = key === 'q' || key === 'Q' || key === '\x03';
            if (!retry && !quit) {
                return;
            }

            stdin.off('data', onData);
            stdin.setRawMode(false);
            stdin.pause();
            resolve(retry);
        };

        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', onData);
    });
}

// Relaunches this same command (runtime, script and original arguments) as
// a child that runs the TUI, for as long as the child asks to be reloaded
export async function superviseDevReload(launchArgs: string[]): Promise<number> {
    const stateFile = path.join(os.tmpdir(), `ccstatusline-dev-reload-${process.pid}.json`);
    const script = process.argv[1];
    const command = [...process.execArgv, ...(script ? [script] : []), ...launchArgs];
    const env = { ...process.env, [DEV_RELOAD_STATE_ENV]: stateFile };

    return runDevReloadSupervisor({
        launch: () => spawnSync(process.execPath, command, { stdio: 'inherit', env }).status ?? 1,
        promptRetry: promptRetryOnTerminal,
        cleanup: () => { removeDevReloadSnapshot(stateFile); }
    });
}
