import {
    chmodSync,
    mkdtempSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    checkForUpdates,
    runGlobalPackageInstall
} from '../update-checker';

const ALL_AVAILABLE = {
    npm: true,
    npx: true,
    bun: true,
    bunx: true
};

// Upstream 9246095: the registry's `version` flows into the install commands
// the TUI shows and runs, so it must be a plain semver release. A hostile or
// malformed version is a registry failure, and a global install refuses it.
function stubNpmOnPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ccsl-update-checker-'));
    const stub = join(dir, 'npm');
    writeFileSync(stub, '#!/bin/sh\nexit 0\n');
    chmodSync(stub, 0o755);
    return dir;
}

describe('upstream 9246095: registry versions are plain semver releases', () => {
    let originalPath: string | undefined;

    beforeEach(() => {
        originalPath = process.env.PATH;
    });

    afterEach(() => {
        process.env.PATH = originalPath;
    });

    it.each([
        ['2.3.0 & calc'],
        ['latest is 2.3.0']
    ])('treats a hostile registry version (%s) as a registry failure', async (version) => {
        const result = await checkForUpdates({
            currentVersion: '2.2.13',
            installedCommand: null,
            commandAvailability: ALL_AVAILABLE,
            latestVersionFetcher: () => Promise.resolve(version)
        });

        expect(result.status).toBe('registry-failure');
        expect(result.status === 'registry-failure'
            && result.errorMessage).toBe('npm registry returned an invalid version');
    });

    it('treats an incomplete registry version as a registry failure', async () => {
        const result = await checkForUpdates({
            currentVersion: '2.2.13',
            installedCommand: null,
            commandAvailability: ALL_AVAILABLE,
            latestVersionFetcher: () => Promise.resolve('2.3')
        });

        expect(result.status).toBe('registry-failure');
    });

    it('still lets plain prerelease registry versions through the guard', async () => {
        const result = await checkForUpdates({
            currentVersion: '2.2.13',
            installedCommand: null,
            commandAvailability: ALL_AVAILABLE,
            latestVersionFetcher: () => Promise.resolve('2.3.0-beta.1')
        });

        expect(result.status).not.toBe('registry-failure');
    });

    it.each([
        ['2.4.0'],
        ['10.4.201'],
        ['3.21.0'],
        ['2.3.0+b7']
    ])('still lets plain release %s through the guard', async (version) => {
        const result = await checkForUpdates({
            currentVersion: '2.2.13',
            installedCommand: null,
            commandAvailability: ALL_AVAILABLE,
            latestVersionFetcher: () => Promise.resolve(version)
        });

        expect(result.status).not.toBe('registry-failure');
    });

    it('refuses a global install for a hostile version without running npm', async () => {
        process.env.PATH = `${stubNpmOnPath()}:${process.env.PATH}`;

        await expect(
            runGlobalPackageInstall('npm', '2.3.0 & calc')
        ).rejects.toThrow('Not a release version');
    });

    it('runs a global install for a plain release through the stubbed npm', async () => {
        process.env.PATH = `${stubNpmOnPath()}:${process.env.PATH}`;

        await expect(
            runGlobalPackageInstall('npm', '2.4.0')
        ).resolves.toBeUndefined();
    });
});
