import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type InstallationMetadata
} from '../../types/Settings';
import {
    clearInstallMenuSelection,
    getConfirmCancelScreen,
    getCurrentInstallation,
    getPathInferredInstallation,
    getPinnedVersionMismatch
} from '../App';
import {
    buildMainMenuItems,
    getMainMenuInstallSelectionIndex,
    getMainMenuSelectionIndex
} from '../components/MainMenu';
import { buildManageInstallationItems } from '../components/ManageInstallationMenu';

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
