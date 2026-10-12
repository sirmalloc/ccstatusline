import chalk from 'chalk';
import * as fs from 'node:fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type InstallationMetadata
} from '../../types/Settings';
import * as claudeSettings from '../../utils/claude-settings';
import * as globalPackageManager from '../../utils/global-package-manager';
import { getPackageVersion } from '../../utils/terminal';
import * as updateChecker from '../../utils/update-checker';
import {
    applyTuiImport,
    buildConfigLoadWarning,
    buildInvalidConfigSaveConfirm,
    clearInstallMenuSelection,
    getConfirmCancelScreen,
    getCurrentInstallation,
    getPathInferredInstallation,
    getPinnedVersionMismatch
} from '../App';
import * as claudeStatus from '../claude-status';
import {
    buildMainMenuItems,
    getMainMenuInstallSelectionIndex,
    getMainMenuSelectionIndex
} from '../components/MainMenu';
import { buildManageInstallationItems } from '../components/ManageInstallationMenu';

import {
    KEYS,
    pressKey,
    renderApp,
    setUpAppSandbox,
    type AppSandbox
} from './helpers/render-app';
import {
    letReactCatchUp,
    waitFor
} from './helpers/wait-for-ink';

function getMenuValues(
    isClaudeInstalled: boolean,
    hasChanges: boolean,
    installation?: InstallationMetadata
): string[] {
    return buildMainMenuItems(isClaudeInstalled, hasChanges, installation)
        .map(item => item === '-' ? '-' : item.value);
}

describe('App confirm navigation helpers', () => {
    it('defaults confirmation cancel navigation to the main menu', () => {
        expect(getConfirmCancelScreen(null)).toBe('main');
        expect(getConfirmCancelScreen({
            message: 'Confirm install?',
            action: () => Promise.resolve()
        })).toBe('main');
    });

    it('returns to the install menu when the confirm dialog requests it', () => {
        expect(getConfirmCancelScreen({
            message: 'Confirm install?',
            action: () => Promise.resolve(),
            cancelScreen: 'install'
        })).toBe('install');
    });

    it('clears saved install selection when leaving the install menu', () => {
        expect(clearInstallMenuSelection({
            main: 5,
            install: 1,
            installPackage: 1
        })).toEqual({ main: 5 });

        const menuSelections = { main: 5 };

        expect(clearInstallMenuSelection(menuSelections)).toBe(menuSelections);
    });
});

describe('TUI config imports', () => {
    it('synchronizes Chalk with the imported color level', () => {
        const originalLevel = chalk.level;

        try {
            const imported = applyTuiImport(
                { ...DEFAULT_SETTINGS, colorLevel: 2 },
                { ...DEFAULT_SETTINGS, colorLevel: 0 },
                'merge',
                ['colorLevel']
            );

            expect(imported.colorLevel).toBe(0);
            expect(chalk.level).toBe(0);
        } finally {
            chalk.level = originalLevel;
        }
    });
});

describe('Pinned version mismatch guard', () => {
    it('uses saved pinned metadata while Claude status line is still loading', () => {
        const installation: InstallationMetadata = {
            method: 'pinned',
            installedVersion: '2.2.13'
        };

        expect(getCurrentInstallation(true, null, {
            ...DEFAULT_SETTINGS,
            installation
        })).toEqual(installation);
    });

    it('does not block auto-update or matching pinned installs', () => {
        expect(getPinnedVersionMismatch({
            method: 'auto-update',
            packageManager: 'bun'
        }, '2.3.0', 'ccstatusline')).toBeNull();

        expect(getPinnedVersionMismatch({
            method: 'pinned',
            packageManager: 'npm',
            installedVersion: '2.3.0'
        }, '2.3.0', 'ccstatusline')).toBeNull();
    });

    it('blocks when the running TUI is newer than the pinned global install', () => {
        expect(getPinnedVersionMismatch({
            method: 'pinned',
            packageManager: 'bun',
            installedVersion: '2.2.13'
        }, '2.3.0', '/home/alice/.bun/bin/ccstatusline')).toEqual({
            packageManager: 'bun',
            installedVersion: '2.2.13',
            runningVersion: '2.3.0',
            relaunchCommand: '/home/alice/.bun/bin/ccstatusline',
            canUpdateToRunningVersion: true
        });
    });

    it('blocks without an update action when the running TUI is older than the pinned global install', () => {
        expect(getPinnedVersionMismatch({
            method: 'pinned',
            packageManager: 'npm',
            installedVersion: '2.3.0'
        }, '2.2.13', '/usr/local/bin/ccstatusline')).toEqual({
            packageManager: 'npm',
            installedVersion: '2.3.0',
            runningVersion: '2.2.13',
            relaunchCommand: '/usr/local/bin/ccstatusline',
            canUpdateToRunningVersion: false
        });
    });

    it('does not block for the version this session just installed', () => {
        expect(getPinnedVersionMismatch({
            method: 'pinned',
            packageManager: 'npm',
            installedVersion: '2.3.0'
        }, '2.2.13', '/usr/local/bin/ccstatusline', '2.3.0')).toBeNull();

        expect(getPinnedVersionMismatch({
            method: 'pinned',
            packageManager: 'npm',
            installedVersion: '2.3.0'
        }, '2.2.13', '/usr/local/bin/ccstatusline', '2.2.20')).not.toBeNull();
    });

    it('infers pinned package manager from the active PATH match', () => {
        expect(getPathInferredInstallation({
            method: 'pinned',
            installedVersion: '2.2.13'
        }, {
            packageManager: 'bun',
            resolvedPath: '/Users/alice/.bun/bin/ccstatusline',
            resolvedPaths: [
                '/Users/alice/.bun/bin/ccstatusline',
                '/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline'
            ],
            binDir: '/Users/alice/.bun/bin',
            version: null,
            warning: null
        })).toEqual({
            method: 'pinned',
            packageManager: 'bun',
            installedVersion: '2.2.13'
        });
    });

    it('uses the active PATH match version when available', () => {
        expect(getPathInferredInstallation({
            method: 'pinned',
            installedVersion: '2.2.13'
        }, {
            packageManager: 'bun',
            resolvedPath: '/Users/alice/.bun/bin/ccstatusline',
            resolvedPaths: ['/Users/alice/.bun/bin/ccstatusline'],
            binDir: '/Users/alice/.bun/bin',
            version: '2.2.13',
            warning: null
        })).toEqual({
            method: 'pinned',
            packageManager: 'bun',
            installedVersion: '2.2.13'
        });
    });
});

describe('Main menu structure', () => {
    it('groups configure status line with terminal/global options when auto-update installed', () => {
        expect(getMenuValues(true, false, {
            method: 'auto-update',
            packageManager: 'npm'
        })).toEqual([
            'lines',
            'colors',
            'powerline',
            '-',
            'terminalConfig',
            'globalOverrides',
            'configureStatusLine',
            '-',
            'exportConfig',
            'importConfig',
            '-',
            'install',
            '-',
            'exit',
            '-',
            'starGithub'
        ]);
    });

    it('keeps install in its own section when not installed', () => {
        expect(getMenuValues(false, false)).toEqual([
            'lines',
            'colors',
            'powerline',
            '-',
            'terminalConfig',
            'globalOverrides',
            'configureStatusLine',
            '-',
            'exportConfig',
            'importConfig',
            '-',
            'install',
            '-',
            'exit',
            '-',
            'starGithub'
        ]);
    });

    it('uses manage installation for pinned installs', () => {
        const installation: InstallationMetadata = {
            method: 'pinned',
            installedVersion: '2.2.13'
        };

        expect(getMenuValues(true, false, installation)).toEqual([
            'lines',
            'colors',
            'powerline',
            '-',
            'terminalConfig',
            'globalOverrides',
            'configureStatusLine',
            '-',
            'exportConfig',
            'importConfig',
            '-',
            'manageInstallation',
            '-',
            'exit',
            '-',
            'starGithub'
        ]);

        const manageItem = buildMainMenuItems(true, false, installation)
            .find(item => item !== '-' && item.value === 'manageInstallation');

        expect(manageItem).toEqual(expect.objectContaining({ label: '🧰 Manage Installation' }));
    });

    it('uses a consistent update icon in manage installation and computes install selection indices', () => {
        const configureItem = buildMainMenuItems(false, false)
            .find(item => item !== '-' && item.value === 'configureStatusLine');
        const autoInstallation: InstallationMetadata = {
            method: 'auto-update',
            packageManager: 'npm'
        };
        const pinnedInstallation: InstallationMetadata = {
            method: 'pinned',
            installedVersion: '2.2.13'
        };

        expect(configureItem).toEqual(expect.objectContaining({
            disabled: true,
            sublabel: '(install first)'
        }));
        expect(buildManageInstallationItems()[0]).toEqual(expect.objectContaining({ label: '🔄 Check for Updates' }));
        expect(getMainMenuInstallSelectionIndex(false)).toBe(7);
        expect(getMainMenuInstallSelectionIndex(true, autoInstallation)).toBe(8);
        expect(getMainMenuInstallSelectionIndex(true, pinnedInstallation)).toBe(8);
        expect(getMainMenuSelectionIndex(buildMainMenuItems(true, false, autoInstallation), 'install')).toBe(8);
        expect(getMainMenuSelectionIndex(
            buildMainMenuItems(true, false, pinnedInstallation),
            'manageInstallation'
        )).toBe(8);
    });
});

describe('Invalid-config TUI guards', () => {
    it('returns null when there is no config load error', () => {
        expect(buildConfigLoadWarning(null)).toBeNull();
        expect(buildInvalidConfigSaveConfirm(null, vi.fn())).toBeNull();
    });

    it('builds a banner that names the reason and warns about overwriting', () => {
        const warning = buildConfigLoadWarning('settings.json is not valid JSON');
        expect(warning).toContain('settings.json is not valid JSON');
        expect(warning).toContain('overwrites the file');
    });

    it('builds a save-guard confirm dialog that returns to main on cancel', () => {
        const guard = buildInvalidConfigSaveConfirm('settings.json could not be read', vi.fn());
        expect(guard).not.toBeNull();
        expect(guard?.cancelScreen).toBe('main');
        expect(guard?.message).toContain('preserved');
        expect(guard?.message).toContain('could not be read');
    });

    it('builds a save-guard confirm dialog that returns to the given screen on cancel', () => {
        expect(buildInvalidConfigSaveConfirm('settings.json could not be read', vi.fn(), 'items')?.cancelScreen)
            .toBe('items');
    });

    it('invokes the provided onConfirm when the guard action runs', async () => {
        const onConfirm = vi.fn();
        const guard = buildInvalidConfigSaveConfirm('settings.json is not valid JSON', onConfirm);
        await guard?.action();
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    it('reflects the specific load-error reason in the save-guard message', () => {
        expect(buildInvalidConfigSaveConfirm('settings.json is not valid JSON', vi.fn())?.message)
            .toContain('settings.json is not valid JSON');
        expect(buildInvalidConfigSaveConfirm('settings.json is not in a valid format', vi.fn())?.message)
            .toContain('not in a valid format');
    });
});

describe('App after a global update run from the TUI', () => {
    let sandbox: AppSandbox;

    beforeEach(() => {
        sandbox = setUpAppSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('keeps the TUI and its unsaved edits when the pinned install moves past this version', async () => {
        const runningVersion = getPackageVersion();
        fs.writeFileSync(sandbox.settingsPath, JSON.stringify({
            ...DEFAULT_SETTINGS,
            installation: { method: 'pinned', installedVersion: runningVersion }
        }));
        vi.spyOn(claudeStatus, 'loadClaudeStatusLineState').mockResolvedValue({ existingStatusLine: null, refreshInterval: null });
        vi.spyOn(claudeSettings, 'isInstalled').mockResolvedValue(true);
        vi.spyOn(globalPackageManager, 'inspectActiveGlobalCommand').mockReturnValue({
            packageManager: 'npm',
            resolvedPath: '/usr/local/bin/ccstatusline',
            resolvedPaths: ['/usr/local/bin/ccstatusline'],
            binDir: '/usr/local/bin',
            version: null,
            warning: null
        });
        vi.spyOn(updateChecker, 'checkForUpdates').mockResolvedValue({
            status: 'update-available',
            currentVersion: runningVersion,
            latestVersion: '99.0.0',
            installation: { method: 'pinned', packageManager: 'npm', installedVersion: runningVersion },
            actions: [{
                id: 'npm-global',
                packageManager: 'npm',
                command: 'npm install -g ccstatusline@99.0.0',
                version: '99.0.0',
                available: true
            }]
        });
        const runUpdate = vi.spyOn(updateChecker, 'runGlobalUpdateAction').mockResolvedValue(undefined);
        const rendered = renderApp();

        try {
            await waitFor(() => {
                expect(rendered.getFrame()).toContain('Main Menu');
            });

            // An unsaved edit: Color Level 256 → Truecolor
            await pressKey(rendered, KEYS.down, '▶  🎨 Edit Colors');
            await pressKey(rendered, KEYS.down, '▶  ⚡ Powerline Setup');
            await pressKey(rendered, KEYS.down, '▶  💻 Terminal Options');
            await pressKey(rendered, KEYS.enter, '▶  ◱ Terminal Width');
            await pressKey(rendered, KEYS.down, '▶  ▓ Color Level');
            await pressKey(rendered, KEYS.enter, '(Truecolor)');
            await pressKey(rendered, KEYS.escape, '💾 Save & Exit');

            await pressKey(rendered, KEYS.down, '▶  🌐 Global Overrides');
            await pressKey(rendered, KEYS.down, '▶  🔧 Configure Status Line');
            await pressKey(rendered, KEYS.down, '▶  📤 Export Config');
            await pressKey(rendered, KEYS.down, '▶  📥 Import Config');
            await pressKey(rendered, KEYS.down, '▶  🧰 Manage Installation');
            await pressKey(rendered, KEYS.enter, '▶  🔄 Check for Updates');
            await pressKey(rendered, KEYS.enter, 'An update is available.');
            await pressKey(rendered, KEYS.enter, 'Run global update command?');
            await pressKey(rendered, KEYS.enter, '✓ Global package updated');
            expect(runUpdate).toHaveBeenCalledOnce();
            expect(rendered.getFrame()).not.toContain('Pinned Install Version Mismatch');

            await pressKey(rendered, KEYS.ctrlS, '✓ Configuration saved');
            const saved = JSON.parse(fs.readFileSync(sandbox.settingsPath, 'utf-8')) as {
                colorLevel: number;
                installation: InstallationMetadata;
            };
            expect(saved.colorLevel).toBe(3);
            expect(saved.installation).toEqual({ method: 'pinned', installedVersion: '99.0.0' });
        } finally {
            rendered.cleanup();
        }
    });
});

describe('App save guard for an invalid settings.json', () => {
    let sandbox: AppSandbox;

    beforeEach(() => {
        sandbox = setUpAppSandbox();
        fs.writeFileSync(sandbox.settingsPath, JSON.stringify({ lines: 'not a list' }));
        vi.spyOn(claudeStatus, 'loadClaudeStatusLineState').mockResolvedValue({ existingStatusLine: null, refreshInterval: null });
        vi.spyOn(claudeSettings, 'isInstalled').mockResolvedValue(false);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('returns to the screen Ctrl+S was pressed on, whether the save is cancelled or confirmed', async () => {
        const rendered = renderApp();

        try {
            await waitFor(() => {
                expect(rendered.getFrame()).toContain('not in a valid format');
            });
            await pressKey(rendered, KEYS.enter, 'Select Line to Edit Items');
            await pressKey(rendered, KEYS.enter, 'Edit Line 1');

            await pressKey(rendered, KEYS.ctrlS, 'is preserved on disk');
            await pressKey(rendered, KEYS.escape, 'Edit Line 1');
            expect(fs.readFileSync(sandbox.settingsPath, 'utf-8')).toContain('not a list');

            await pressKey(rendered, KEYS.ctrlS, 'is preserved on disk');
            await pressKey(rendered, KEYS.enter, '✓ Configuration saved');
            expect(rendered.getFrame()).toContain('Edit Line 1');
            const saved = JSON.parse(fs.readFileSync(sandbox.settingsPath, 'utf-8')) as { lines: unknown };
            expect(Array.isArray(saved.lines)).toBe(true);
        } finally {
            rendered.cleanup();
        }
    });
});

function createPendingRun() {
    let finish: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => {
        finish = resolve;
    }));

    return { run, finish: () => { finish(); } };
}

describe('App while an install or update runs', () => {
    let sandbox: AppSandbox;

    beforeEach(() => {
        sandbox = setUpAppSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('runs a confirmed install once, ignoring Enter and ESC until it finishes', async () => {
        vi.spyOn(claudeStatus, 'loadClaudeStatusLineState').mockResolvedValue({ existingStatusLine: null, refreshInterval: null });
        vi.spyOn(claudeSettings, 'isInstalled').mockResolvedValue(false);
        vi.spyOn(claudeSettings, 'getExistingStatusLine').mockResolvedValue(null);
        vi.spyOn(globalPackageManager, 'inspectActiveGlobalCommand').mockReturnValue({
            packageManager: 'unknown',
            resolvedPath: null,
            resolvedPaths: [],
            binDir: null,
            version: null,
            warning: null
        });
        const globalInstall = createPendingRun();
        vi.spyOn(updateChecker, 'runGlobalPackageInstall').mockImplementation(globalInstall.run);
        const writeClaudeSettings = vi.spyOn(claudeSettings, 'installStatusLine').mockResolvedValue(undefined);
        const rendered = renderApp();

        try {
            await waitFor(() => {
                expect(rendered.getFrame()).toContain('Main Menu');
            });
            await pressKey(rendered, KEYS.up, '▶  ⭐ Like ccstatusline?');
            await pressKey(rendered, KEYS.up, '▶  🚪 Exit');
            await pressKey(rendered, KEYS.up, '▶  📦 Install to Claude Code');
            await pressKey(rendered, KEYS.enter, 'Select update style');
            await pressKey(rendered, KEYS.enter, 'Select package manager');
            await pressKey(rendered, KEYS.enter, 'Continue?');

            // Yes: the global install starts and doesn't finish yet
            rendered.stdin.write(KEYS.enter);
            await waitFor(() => {
                expect(globalInstall.run).toHaveBeenCalledOnce();
            });

            rendered.stdin.write(KEYS.enter);
            await letReactCatchUp();
            rendered.stdin.write(KEYS.escape);
            await letReactCatchUp();
            expect(globalInstall.run).toHaveBeenCalledOnce();
            expect(rendered.getFrame()).toContain('Working...');
            expect(rendered.getFrame()).not.toContain('Select update style');

            globalInstall.finish();
            await waitFor(() => {
                expect(rendered.getFrame()).toContain('✓ Installed to Claude Code');
            });
            expect(globalInstall.run).toHaveBeenCalledOnce();
            expect(writeClaudeSettings).toHaveBeenCalledOnce();
        } finally {
            rendered.cleanup();
        }
    });

    it('runs the pinned version update once, ignoring Enter and ESC until it finishes', async () => {
        fs.writeFileSync(sandbox.settingsPath, JSON.stringify({
            ...DEFAULT_SETTINGS,
            installation: { method: 'pinned', installedVersion: '2.0.0' }
        }));
        vi.spyOn(claudeStatus, 'loadClaudeStatusLineState').mockResolvedValue({ existingStatusLine: null, refreshInterval: null });
        vi.spyOn(claudeSettings, 'isInstalled').mockResolvedValue(true);
        vi.spyOn(globalPackageManager, 'inspectActiveGlobalCommand').mockReturnValue({
            packageManager: 'npm',
            resolvedPath: '/usr/local/bin/ccstatusline',
            resolvedPaths: ['/usr/local/bin/ccstatusline'],
            binDir: '/usr/local/bin',
            version: null,
            warning: null
        });
        const globalInstall = createPendingRun();
        vi.spyOn(updateChecker, 'runGlobalPackageInstall').mockImplementation(globalInstall.run);
        const rendered = renderApp();

        try {
            await waitFor(() => {
                expect(rendered.getFrame()).toContain('Pinned Install Version Mismatch');
            });
            rendered.stdin.write(KEYS.enter);
            await waitFor(() => {
                expect(globalInstall.run).toHaveBeenCalledOnce();
            });

            rendered.stdin.write(KEYS.enter);
            await letReactCatchUp();
            rendered.stdin.write(KEYS.escape);
            await letReactCatchUp();
            expect(globalInstall.run).toHaveBeenCalledOnce();
            expect(rendered.getFrame()).toContain('Updating npm global install to v');
            expect(rendered.getFrame()).not.toContain('Exit');

            globalInstall.finish();
            await waitFor(() => {
                expect(rendered.getFrame()).toContain('✓ Global package updated');
            });
            expect(rendered.getFrame()).toContain('Main Menu');
            expect(globalInstall.run).toHaveBeenCalledOnce();
        } finally {
            rendered.cleanup();
        }
    });
});
