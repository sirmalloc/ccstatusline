import { spawn as spawnProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
export const DEV_RELOAD_CHILD_ARG_PREFIX = '--ccstatusline-dev-reload-child=';
// EX_TEMPFAIL: "try again", which is what the supervisor does
export const DEV_RELOAD_EXIT_CODE = 75;

const DEV_RELOAD_STATE_DIR_PREFIX = 'ccstatusline-dev-reload-';
const DEV_RELOAD_CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;

export type DevReloadMode = 'off' | 'supervisor' | 'child';

function getDevReloadStateDir(args: readonly string[]): string | null {
    const childArgs = args.filter(arg => arg.startsWith(DEV_RELOAD_CHILD_ARG_PREFIX));
    if (childArgs.length !== 1) {
        return null;
    }

    const capability = childArgs[0]?.slice(DEV_RELOAD_CHILD_ARG_PREFIX.length);
    if (!capability || !DEV_RELOAD_CAPABILITY_PATTERN.test(capability)) {
        return null;
    }

    const stateDir = path.join(os.tmpdir(), `${DEV_RELOAD_STATE_DIR_PREFIX}${capability}`);
    try {
        const stats = fs.lstatSync(stateDir);
        if (!stats.isDirectory() || stats.isSymbolicLink()) {
            return null;
        }
        if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
            return null;
        }
        if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
            return null;
        }
    } catch {
        return null;
    }

    return stateDir;
}

export function getDevReloadMode(env: NodeJS.ProcessEnv, args: readonly string[] = process.argv): DevReloadMode {
    if (env[DEV_RELOAD_ENV] !== '1') {
        return 'off';
    }

    return getDevReloadStateDir(args) ? 'child' : 'supervisor';
}

export function getDevReloadStateFile(env: NodeJS.ProcessEnv, args: readonly string[] = process.argv): string | null {
    if (env[DEV_RELOAD_ENV] !== '1') {
        return null;
    }

    const stateDir = getDevReloadStateDir(args);
    return stateDir ? path.join(stateDir, 'snapshot.json') : null;
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

// For when the settings file is written: a snapshot taken before that is
// older than the file, so the next TUI should load the file instead
export function discardDevReloadSnapshot(stateFile: string): void {
    fs.rmSync(stateFile, { force: true });
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

// The random capability is passed as an internal command-line argument, not
// through ambient environment state. A child derives the fixed snapshot path
// from it, so project .env values cannot select a file or impersonate a child.
function createDevReloadState(): { stateDir: string; capability: string } {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const capability = randomBytes(32).toString('hex');
        const stateDir = path.join(os.tmpdir(), `${DEV_RELOAD_STATE_DIR_PREFIX}${capability}`);
        try {
            fs.mkdirSync(stateDir, { mode: 0o700 });
            return { stateDir, capability };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    throw new Error('Unable to create a unique dev reload state directory');
}

function removeDevReloadStateDir(stateDir: string): void {
    fs.rmSync(stateDir, { recursive: true, force: true });
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
    // Runs the TUI and settles with its exit code
    launch: () => Promise<number>;
    // Asked after a crash; true relaunches, false gives up
    promptRetry: (exitCode: number) => Promise<boolean>;
    cleanup: () => void;
}

export async function runDevReloadSupervisor(deps: DevReloadSupervisorDeps): Promise<number> {
    for (;;) {
        const exitCode = await deps.launch();
        if (exitCode === DEV_RELOAD_EXIT_CODE) {
            continue;
        }

        if (exitCode === 0 || !(await deps.promptRetry(exitCode))) {
            deps.cleanup();
            return exitCode;
        }
    }
}

export interface DevReloadTerminal {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
}

export function promptRetryOnTerminal(exitCode: number, terminal: DevReloadTerminal = process): Promise<boolean> {
    terminal.stdout.write(`\nReload failed (exit ${exitCode}). Fix the code, then press Enter to retry, or q to quit.\n`);

    return new Promise((resolve) => {
        const stdin = terminal.stdin;
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

// A running child process: settles with its exit code, and takes signals
export interface DevReloadChild {
    exited: Promise<number>;
    kill: (signal: NodeJS.Signals) => void;
}

export type DevReloadSpawn = (command: string, args: string[], env: NodeJS.ProcessEnv) => DevReloadChild;

// Not spawnSync: the supervisor has to handle signals while the TUI runs
function spawnInTerminal(command: string, args: string[], env: NodeJS.ProcessEnv): DevReloadChild {
    const child = spawnProcess(command, args, { stdio: 'inherit', env });
    return {
        exited: new Promise((resolve) => {
            child.once('exit', (code) => {
                resolve(code ?? 1);
            });
            // The runtime could not be started
            child.once('error', () => {
                resolve(1);
            });
        }),
        kill: (signal) => {
            child.kill(signal);
        }
    };
}

// The supervisor's own process: the terminal it prompts on, and the signals
// and exit that stop it
export interface DevReloadProcess extends DevReloadTerminal {
    on: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => unknown;
    off: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => unknown;
    exit: (code: number) => void;
}

const STOP_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];

function signalExitCode(signal: NodeJS.Signals): number {
    return 128 + os.constants.signals[signal];
}

// Relaunches this same command (runtime, script and original arguments) as
// a child that runs the TUI, for as long as the child asks to be reloaded
export async function superviseDevReload(
    launchArgs: string[],
    spawn: DevReloadSpawn = spawnInTerminal,
    host: DevReloadProcess = process
): Promise<number> {
    const { stateDir, capability } = createDevReloadState();
    const script = process.argv[1];
    const childArg = `${DEV_RELOAD_CHILD_ARG_PREFIX}${capability}`;
    const command = [...process.execArgv, ...(script ? [script] : []), childArg, ...launchArgs];
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        [DEV_RELOAD_ENV]: '1'
    };
    delete env.CCSTATUSLINE_DEV_RELOAD_STATE;

    // A signal sent to the supervisor alone (kill <pid>) would end it and
    // orphan the TUI, leaving the snapshot behind. Instead the signal is
    // passed on, and the supervisor cleans up and stops once the TUI has
    // gone; at the retry prompt there is no TUI to wait for.
    let child: DevReloadChild | null = null;
    let stopSignal: NodeJS.Signals | null = null;
    const stop = (signal: NodeJS.Signals) => {
        stopSignal = signal;
        if (child) {
            child.kill(signal);
            return;
        }

        removeDevReloadStateDir(stateDir);
        host.exit(signalExitCode(signal));
    };
    for (const signal of STOP_SIGNALS) {
        host.on(signal, stop);
    }

    try {
        return await runDevReloadSupervisor({
            launch: async () => {
                child = spawn(process.execPath, command, env);
                const exitCode = await child.exited;
                child = null;
                return stopSignal ? signalExitCode(stopSignal) : exitCode;
            },
            // A TUI that ended because the supervisor was stopped didn't crash
            promptRetry: exitCode => (stopSignal ? Promise.resolve(false) : promptRetryOnTerminal(exitCode, host)),
            cleanup: () => { removeDevReloadStateDir(stateDir); }
        });
    } finally {
        for (const signal of STOP_SIGNALS) {
            host.off(signal, stop);
        }
    }
}
