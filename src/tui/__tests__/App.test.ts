import * as os from 'os';
import * as path from 'path';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type InstallationMetadata
} from '../../types/Settings';
import { getProjectConfigPath } from '../../utils/scope';
import {
    buildConfigLoadWarning,
    buildInvalidConfigSaveConfirm,
    clearInstallMenuSelection,
    getConfirmCancelScreen,
    getCurrentInstallation,
    getPathInferredInstallation,
    getPinnedVersionMismatch,
    getScopeIndicator,
    planScopeSwitch
} from '../App';
import {
    buildMainMenuItems,
    getMainMenuInstallSelectionIndex,
    getMainMenuSelectionIndex
} from '../components/MainMenu';
import { buildManageInstallationItems } from '../components/ManageInstallationMenu';
import { getScopeSwitchMenuItems } from '../components/ScopeSwitchMenu';

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
        expect(getMainMenuInstallSelectionIndex(false)).toBe(5);
        expect(getMainMenuInstallSelectionIndex(true, autoInstallation)).toBe(6);
        expect(getMainMenuInstallSelectionIndex(true, pinnedInstallation)).toBe(6);
        expect(getMainMenuSelectionIndex(buildMainMenuItems(true, false, autoInstallation), 'install')).toBe(6);
        expect(getMainMenuSelectionIndex(
            buildMainMenuItems(true, false, pinnedInstallation),
            'manageInstallation'
        )).toBe(6);
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

describe('Scope indicator', () => {
    it('shows global mode with the switch hint', () => {
        expect(getScopeIndicator({ type: 'global' })).toBe('Mode: Global · ctrl+p to switch');
    });

    it('shows the ~-abbreviated resolved config path when the root is under the home dir', () => {
        const root = path.join(os.homedir(), 'some', 'project');
        const expectedConfigPath = path.join('~', 'some', 'project', '.claude', 'ccstatusline.json');
        expect(getScopeIndicator({ type: 'project', root }))
            .toBe(`Mode: Project (${expectedConfigPath}) · ctrl+p to switch`);
    });

    it('shows the raw resolved config path when the root is outside the home dir', () => {
        const outsideRoot = path.join(path.parse(os.homedir()).root, 'outside-of-home', 'project');
        expect(outsideRoot.startsWith(os.homedir())).toBe(false);
        expect(getScopeIndicator({ type: 'project', root: outsideRoot }))
            .toBe(`Mode: Project (${getProjectConfigPath(outsideRoot)}) · ctrl+p to switch`);
    });

    it('returns null for custom scope so the Config path line renders instead', () => {
        expect(getScopeIndicator({ type: 'custom' })).toBeNull();
    });
});

describe('Scope switch planning', () => {
    it('blocks when switching is unavailable (custom scope)', () => {
        expect(planScopeSwitch({
            switchingAvailable: false,
            hasChanges: false,
            enteringProject: true,
            projectConfigExists: false
        })).toBe('blocked');
    });

    it('asks about unsaved changes first', () => {
        expect(planScopeSwitch({
            switchingAvailable: true,
            hasChanges: true,
            enteringProject: true,
            projectConfigExists: false
        })).toBe('confirm-unsaved');
    });

    it('offers seeding when entering a project without a config', () => {
        expect(planScopeSwitch({
            switchingAvailable: true,
            hasChanges: false,
            enteringProject: true,
            projectConfigExists: false
        })).toBe('offer-seed');
    });

    it('switches directly into an existing project config', () => {
        expect(planScopeSwitch({
            switchingAvailable: true,
            hasChanges: false,
            enteringProject: true,
            projectConfigExists: true
        })).toBe('switch');
    });

    it('switches directly back to global', () => {
        expect(planScopeSwitch({
            switchingAvailable: true,
            hasChanges: false,
            enteringProject: false,
            projectConfigExists: false
        })).toBe('switch');
    });
});

describe('Scope switch menu items', () => {
    it('offers save/discard/cancel for unsaved changes', () => {
        expect(getScopeSwitchMenuItems('unsaved').map(item => item.value))
            .toEqual(['save', 'discard', 'cancel']);
    });

    it('offers copy/defaults/cancel for an empty project', () => {
        expect(getScopeSwitchMenuItems('seed').map(item => item.value))
            .toEqual(['copy', 'defaults', 'cancel']);
    });
});
