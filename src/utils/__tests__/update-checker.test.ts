import { HttpsProxyAgent } from 'https-proxy-agent';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
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
    fetchLatestNpmVersion,
    runGlobalPackageInstall,
    type UpdateCheckResult
} from '../update-checker';

import {
    isolateHttpsProxyEnv,
    startStalledProxy,
    type StalledProxy
} from './proxy-test-helpers';

type RegistryRequestFn = NonNullable<Parameters<typeof fetchLatestNpmVersion>[1]>;

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
        expect(execFileSpy.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ shell: true }));
    });

    // The version is shown in install commands and, for npm on Windows, runs
    // through cmd.exe, so only a plain release version is accepted
    it.each(['2.3.0 & calc', '2.3.0"', '^2.3.0', 'latest', '2.3'])('treats the registry version %j as a registry failure', async (latestVersion) => {
        const result = await checkForUpdates({
            currentVersion: '2.2.13',
            installedCommand: CCSTATUSLINE_COMMANDS.NPM,
            commandAvailability: ALL_AVAILABLE,
            latestVersionFetcher: () => Promise.resolve(latestVersion)
        });

        expect(result).toEqual({
            status: 'registry-failure',
            currentVersion: '2.2.13',
            installation: {
                method: 'auto-update',
                packageManager: 'npm'
            },
            errorMessage: 'npm registry returned an invalid version'
        });
    });

    it.each(['2.3.0', '2.3.0-beta.1', '10.0.0+build.5'])('accepts the registry version %j', async (latestVersion) => {
        const result = await checkForUpdates({
            currentVersion: '2.2.13',
            installedCommand: null,
            commandAvailability: ALL_AVAILABLE,
            latestVersionFetcher: () => Promise.resolve(latestVersion)
        });

        expect(result.status).toBe('update-available');
    });

    it('refuses to install a version that is not a plain release version', async () => {
        const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((...args: unknown[]) => {
            const callback = args[3] as (error: Error | null) => void;
            callback(null);
            return {};
        }) as typeof childProcess.execFile);

        await expect(runGlobalPackageInstall('npm', '2.3.0 & calc', { platform: 'win32' }))
            .rejects.toThrow('Not a release version');
        expect(execFileSpy).not.toHaveBeenCalled();
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

describe('npm registry request', () => {
    isolateHttpsProxyEnv();

    // Answers 200 with the body in one chunk
    function respondingRequest(body: string): RegistryRequestFn {
        return (_url, _options, onResponse) => Object.assign(new EventEmitter(), {
            destroy: () => undefined,
            end() {
                const response = Object.assign(new EventEmitter(), {
                    statusCode: 200,
                    resume: () => undefined,
                    setEncoding: () => undefined
                });
                onResponse(response);
                response.emit('data', body);
                response.emit('end');
            }
        });
    }

    // Under Bun, and Node without an agent default, a socket timeout can't fire
    // while the request is still connecting
    it('gives up once the deadline passes, even before the request connects', async () => {
        const destroy = vi.fn();
        const connectingRequest: RegistryRequestFn = () => Object.assign(new EventEmitter(), {
            destroy,
            end: () => undefined
        });

        const result = await Promise.race([
            fetchLatestNpmVersion(10, connectingRequest).catch((error: unknown) => error),
            new Promise<'still pending'>(resolve => setTimeout(() => { resolve('still pending'); }, 1000))
        ]);

        expect(result).toEqual(new Error('npm registry request timed out after 10ms'));
        expect(destroy).toHaveBeenCalledOnce();
    });

    it.each([302, 503, undefined])('closes a stalled HTTP %s response before rejecting', async (statusCode) => {
        const destroy = vi.fn();
        const stalledErrorRequest: RegistryRequestFn = (_url, _options, onResponse) => Object.assign(new EventEmitter(), {
            destroy,
            end() {
                // Headers arrive, but the server never finishes the body.
                onResponse(Object.assign(new EventEmitter(), {
                    statusCode,
                    resume: () => undefined,
                    setEncoding: () => undefined
                }));
            }
        });

        await expect(fetchLatestNpmVersion(5000, stalledErrorRequest))
            .rejects.toThrow(`npm registry returned HTTP ${statusCode ?? 'unknown'}`);
        expect(destroy).toHaveBeenCalledOnce();
    });

    // A host:port with no scheme is an HTTP proxy, as curl reads it
    it.each([
        ['', 'http://proxy.example:8080'],
        [' given as host:port, with no scheme', 'proxy.example:8080']
    ])('tunnels through the proxy named by HTTPS_PROXY%s', async (_label, proxyUrl) => {
        process.env.HTTPS_PROXY = proxyUrl;
        const requestFn = vi.fn(respondingRequest('{"version":"2.3.0"}'));

        await expect(fetchLatestNpmVersion(5000, requestFn)).resolves.toBe('2.3.0');

        const agent = requestFn.mock.calls[0]?.[1].agent;
        expect(agent).toBeInstanceOf(HttpsProxyAgent);
        expect((agent as HttpsProxyAgent<string>).proxy.href).toBe('http://proxy.example:8080/');
    });

    it.each([
        ['NO_PROXY lists npmjs.org', { HTTPS_PROXY: 'http://proxy.example:8080', NO_PROXY: 'localhost,.npmjs.org' }],
        ['HTTPS_PROXY is blank', { HTTPS_PROXY: '   ' }]
    ])('connects directly when %s', async (_label, env) => {
        Object.assign(process.env, env);
        const requestFn = vi.fn(respondingRequest('{"version":"2.3.0"}'));

        await expect(fetchLatestNpmVersion(5000, requestFn)).resolves.toBe('2.3.0');
        expect(requestFn.mock.calls[0]?.[1]).not.toHaveProperty('agent');
    });

    it('fails without sending a request when HTTPS_PROXY is not a valid URL', async () => {
        process.env.HTTPS_PROXY = 'not a proxy url';
        const requestFn = vi.fn(respondingRequest('{"version":"2.3.0"}'));

        await expect(fetchLatestNpmVersion(5000, requestFn)).rejects.toThrow('HTTPS_PROXY is not a valid URL');
        expect(requestFn).not.toHaveBeenCalled();
    });

    // The agent's own connection to the proxy would keep the process alive
    describe('behind a proxy that never answers CONNECT', () => {
        let proxy: StalledProxy | null = null;

        afterEach(async () => {
            await proxy?.stop();
            proxy = null;
        });

        it('gives up at the deadline and closes its connection to the proxy', async () => {
            proxy = await startStalledProxy();
            process.env.HTTPS_PROXY = proxy.url;

            await expect(fetchLatestNpmVersion(50)).rejects.toThrow('npm registry request timed out after 50ms');
            await proxy.connectionClosed;
        });
    });
});
