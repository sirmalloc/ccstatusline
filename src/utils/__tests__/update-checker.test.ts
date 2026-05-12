import * as childProcess from 'child_process';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { CCSTATUSLINE_COMMANDS } from '../claude-settings';
import { initConfigPath } from '../config';
import {
    buildUpdateCheckResult,
    checkForUpdates,
    runGlobalPackageInstall,
    type UpdateCheckResult
} from '../update-checker';

const ALL_AVAILABLE = {
    npm: true,
    npx: true,
    bun: true,
    bunx: true
};

describe('update checker', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns up-to-date when latest is not newer', () => {
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.2.13',
            installedCommand: CCSTATUSLINE_COMMANDS.NPM,
            commandAvailability: ALL_AVAILABLE
        });

        expect(result).toEqual({
            status: 'up-to-date',
            currentVersion: '2.2.13',
            latestVersion: '2.2.13',
            installation: {
                method: 'auto-update',
                packageManager: 'npm'
            }
        });
    });

    it('returns update available for newer registry versions', () => {
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.3.0',
            installedCommand: null,
            commandAvailability: ALL_AVAILABLE
        });

        expect(result.status).toBe('update-available');
        expect((result as UpdateCheckResult & { status: 'update-available' }).actions).toHaveLength(2);
    });

    it('returns registry failure when the registry request fails', async () => {
        const result = await checkForUpdates({
            currentVersion: '2.2.13',
            installedCommand: CCSTATUSLINE_COMMANDS.NPM,
            commandAvailability: ALL_AVAILABLE,
            latestVersionFetcher: () => Promise.reject(new Error('network unavailable'))
        });

        expect(result).toEqual({
            status: 'registry-failure',
            currentVersion: '2.2.13',
            installation: {
                method: 'auto-update',
                packageManager: 'npm'
            },
            errorMessage: 'network unavailable'
        });
    });

    it('offers npm global update for PATH-resolved pinned npm installs', () => {
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.3.0',
            installedCommand: CCSTATUSLINE_COMMANDS.GLOBAL,
            installationMetadata: {
                method: 'pinned',
                packageManager: 'npm',
                installedVersion: '2.2.13'
            },
            commandAvailability: ALL_AVAILABLE
        });

        expect(result.status).toBe('update-available');
        if (result.status !== 'update-available') {
            return;
        }
        expect(result.actions).toEqual([
            {
                id: 'npm-global',
                packageManager: 'npm',
                command: 'npm install -g ccstatusline@2.3.0',
                version: '2.3.0',
                available: true
            }
        ]);
    });

    it('offers bun global update for PATH-resolved pinned bun installs', () => {
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.3.0',
            installedCommand: CCSTATUSLINE_COMMANDS.GLOBAL,
            installationMetadata: {
                method: 'pinned',
                packageManager: 'bun',
                installedVersion: '2.2.13'
            },
            commandAvailability: ALL_AVAILABLE
        });

        expect(result.status).toBe('update-available');
        if (result.status !== 'update-available') {
            return;
        }
        expect(result.actions.map(action => action.command)).toEqual(['bun add -g ccstatusline@2.3.0']);
    });

    it('offers both global update actions when pinned metadata has no resolved package manager', () => {
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.3.0',
            installedCommand: CCSTATUSLINE_COMMANDS.GLOBAL,
            installationMetadata: {
                method: 'pinned',
                installedVersion: '2.2.13'
            },
            commandAvailability: ALL_AVAILABLE
        });

        expect(result.status).toBe('update-available');
        if (result.status !== 'update-available') {
            return;
        }
        expect(result.installation).toEqual({
            method: 'pinned',
            packageManager: 'unknown',
            installedVersion: '2.2.13'
        });
        expect(result.actions.map(action => action.packageManager)).toEqual(['npm', 'bun']);
    });

    it('offers only the active manager for PATH-resolved self-managed installs', () => {
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.3.0',
            installedCommand: CCSTATUSLINE_COMMANDS.GLOBAL,
            installationMetadata: {
                method: 'self-managed',
                packageManager: 'npm'
            },
            commandAvailability: ALL_AVAILABLE
        });

        expect(result.status).toBe('update-available');
        if (result.status !== 'update-available') {
            return;
        }
        expect(result.installation).toEqual({
            method: 'self-managed',
            packageManager: 'npm'
        });
        expect(result.actions.map(action => action.packageManager)).toEqual(['npm']);
    });

    it('uses npm.cmd for Windows global npm installs', async () => {
        const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((...args: unknown[]) => {
            const callback = args[3] as (error: Error | null) => void;
            callback(null);
            return {};
        }) as typeof childProcess.execFile);

        await runGlobalPackageInstall('npm', '2.3.0', { platform: 'win32' });

        expect(execFileSpy.mock.calls[0]?.[0]).toBe('npm.cmd');
        expect(execFileSpy.mock.calls[0]?.[1]).toEqual(['install', '-g', 'ccstatusline@2.3.0']);
    });

    it('does not offer global actions for auto-update installs', () => {
        initConfigPath();
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.3.0',
            installedCommand: CCSTATUSLINE_COMMANDS.BUNX,
            commandAvailability: ALL_AVAILABLE
        });

        expect(result.status).toBe('update-available');
        if (result.status !== 'update-available') {
            return;
        }
        expect(result.actions).toEqual([]);
        expect(result.autoUpdateLaunchCommand).toBe(CCSTATUSLINE_COMMANDS.BUNX);
    });

    it('offers both global commands for unknown global installs and marks unavailable managers', () => {
        const result = buildUpdateCheckResult({
            currentVersion: '2.2.13',
            latestVersion: '2.3.0',
            installedCommand: CCSTATUSLINE_COMMANDS.GLOBAL,
            commandAvailability: {
                ...ALL_AVAILABLE,
                bun: false
            }
        });

        expect(result.status).toBe('update-available');
        if (result.status !== 'update-available') {
            return;
        }
        expect(result.installation).toEqual({
            method: 'self-managed',
            packageManager: 'unknown'
        });
        expect(result.actions).toEqual([
            {
                id: 'npm-global',
                packageManager: 'npm',
                command: 'npm install -g ccstatusline@2.3.0',
                version: '2.3.0',
                available: true
            },
            {
                id: 'bun-global',
                packageManager: 'bun',
                command: 'bun add -g ccstatusline@2.3.0',
                version: '2.3.0',
                available: false
            }
        ]);
    });
});
