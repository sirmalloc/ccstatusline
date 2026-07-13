import { execFile } from 'child_process';
import * as https from 'https';

import type {
    InstallationMetadata,
    ResolvedInstallationMetadata
} from '../types/Settings';

import {
    PINNED_INSTALL_COMMANDS,
    buildStatusLineCommand,
    classifyInstallation,
    type PackageCommandAvailability
} from './claude-settings';
import {
    getPackageManagerExecutable,
    getPackageManagerShellOptions
} from './package-manager-executable';

export const NPM_REGISTRY_LATEST_URL = 'https://registry.npmjs.org/ccstatusline/latest';
const DEFAULT_REGISTRY_TIMEOUT_MS = 5000;
const GLOBAL_UPDATE_TIMEOUT_MS = 120000;

export type UpdateActionId = 'npm-global' | 'bun-global';
export type GlobalUpdatePackageManager = 'npm' | 'bun';

export interface UpdateAction {
    id: UpdateActionId;
    packageManager: GlobalUpdatePackageManager;
    command: string;
    version: string;
    available: boolean;
}

export type UpdateCheckResult
    = | {
        status: 'up-to-date';
        currentVersion: string;
        latestVersion: string;
        installation: ResolvedInstallationMetadata;
    }
    | {
        status: 'update-available';
        currentVersion: string;
        latestVersion: string;
        installation: ResolvedInstallationMetadata;
        actions: UpdateAction[];
        autoUpdateLaunchCommand?: string;
    }
    | {
        status: 'registry-failure';
        currentVersion: string;
        installation: ResolvedInstallationMetadata;
        errorMessage: string;
    };

export interface BuildUpdateCheckResultOptions {
    currentVersion: string;
    latestVersion: string;
    installedCommand?: string | null;
    installationMetadata?: InstallationMetadata | ResolvedInstallationMetadata;
    commandAvailability: PackageCommandAvailability;
}

export interface CheckForUpdatesOptions extends Omit<BuildUpdateCheckResultOptions, 'latestVersion'> {
    timeoutMs?: number;
    latestVersionFetcher?: (timeoutMs: number) => Promise<string>;
}

export interface RunGlobalPackageInstallOptions { platform?: NodeJS.Platform }

function parseVersion(version: string): number[] {
    return version.split(/[.-]/).map((part) => {
        const parsed = parseInt(part, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    });
}

export function compareVersions(left: string, right: string): number {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let i = 0; i < length; i += 1) {
        const leftPart = leftParts[i] ?? 0;
        const rightPart = rightParts[i] ?? 0;

        if (leftPart > rightPart) {
            return 1;
        }

        if (leftPart < rightPart) {
            return -1;
        }
    }

    return 0;
}

export function getGlobalUpdateAction(
    packageManager: GlobalUpdatePackageManager,
    latestVersion: string,
    commandAvailability: PackageCommandAvailability
): UpdateAction {
    if (packageManager === 'npm') {
        return {
            id: 'npm-global',
            packageManager,
            command: PINNED_INSTALL_COMMANDS.NPM(latestVersion),
            version: latestVersion,
            available: commandAvailability.npm
        };
    }

    return {
        id: 'bun-global',
        packageManager,
        command: PINNED_INSTALL_COMMANDS.BUN(latestVersion),
        version: latestVersion,
        available: commandAvailability.bun
    };
}

function getAutoUpdateLaunchCommand(installation: ResolvedInstallationMetadata): string | undefined {
    if (installation.method !== 'auto-update') {
        return undefined;
    }

    return installation.packageManager === 'bun'
        ? buildStatusLineCommand('auto-bunx')
        : buildStatusLineCommand('auto-npx');
}

function getUpdateActions(
    installation: ResolvedInstallationMetadata,
    latestVersion: string,
    commandAvailability: PackageCommandAvailability
): UpdateAction[] {
    if (installation.method === 'auto-update') {
        return [];
    }

    if (installation.method === 'pinned' || installation.method === 'self-managed') {
        if (installation.packageManager === 'npm') {
            return [getGlobalUpdateAction('npm', latestVersion, commandAvailability)];
        }

        if (installation.packageManager === 'bun') {
            return [getGlobalUpdateAction('bun', latestVersion, commandAvailability)];
        }
    }

    return [
        getGlobalUpdateAction('npm', latestVersion, commandAvailability),
        getGlobalUpdateAction('bun', latestVersion, commandAvailability)
    ];
}

function getResolvedInstallation(
    installedCommand: string | null | undefined,
    installationMetadata?: InstallationMetadata | ResolvedInstallationMetadata
): ResolvedInstallationMetadata {
    const installation = classifyInstallation(installedCommand, installationMetadata);

    if (installation.method === 'self-managed' && installationMetadata?.method === 'self-managed') {
        return {
            ...installation,
            packageManager: installationMetadata.packageManager
        };
    }

    if (installation.method !== 'pinned') {
        return installation;
    }

    return {
        ...installation,
        packageManager: installationMetadata?.method === 'pinned' && 'packageManager' in installationMetadata
            ? installationMetadata.packageManager
            : 'unknown'
    };
}

export function buildUpdateCheckResult({
    currentVersion,
    latestVersion,
    installedCommand,
    installationMetadata,
    commandAvailability
}: BuildUpdateCheckResultOptions): UpdateCheckResult {
    const installation = getResolvedInstallation(installedCommand, installationMetadata);

    if (compareVersions(latestVersion, currentVersion) <= 0) {
        return {
            status: 'up-to-date',
            currentVersion,
            latestVersion,
            installation
        };
    }

    return {
        status: 'update-available',
        currentVersion,
        latestVersion,
        installation,
        actions: getUpdateActions(installation, latestVersion, commandAvailability),
        autoUpdateLaunchCommand: getAutoUpdateLaunchCommand(installation)
    };
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Unable to query npm registry';
}

export async function checkForUpdates({
    currentVersion,
    installedCommand,
    installationMetadata,
    commandAvailability,
    timeoutMs = DEFAULT_REGISTRY_TIMEOUT_MS,
    latestVersionFetcher = fetchLatestNpmVersion
}: CheckForUpdatesOptions): Promise<UpdateCheckResult> {
    try {
        const latestVersion = await latestVersionFetcher(timeoutMs);
        return buildUpdateCheckResult({
            currentVersion,
            latestVersion,
            installedCommand,
            installationMetadata,
            commandAvailability
        });
    } catch (error) {
        return {
            status: 'registry-failure',
            currentVersion,
            installation: getResolvedInstallation(installedCommand, installationMetadata),
            errorMessage: getErrorMessage(error)
        };
    }
}

export function fetchLatestNpmVersion(timeoutMs = DEFAULT_REGISTRY_TIMEOUT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
        const request = https.request(
            NPM_REGISTRY_LATEST_URL,
            {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'ccstatusline'
                }
            },
            (response) => {
                if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                    response.resume();
                    reject(new Error(`npm registry returned HTTP ${response.statusCode ?? 'unknown'}`));
                    return;
                }

                response.setEncoding('utf8');
                let body = '';

                response.on('data', (chunk: string) => {
                    body += chunk;
                });

                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(body) as { version?: unknown };
                        if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
                            reject(new Error('npm registry response did not include a version'));
                            return;
                        }

                        resolve(parsed.version);
                    } catch (error) {
                        reject(error instanceof Error ? error : new Error(String(error)));
                    }
                });
            }
        );

        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`npm registry request timed out after ${timeoutMs}ms`));
        });

        request.on('error', reject);
        request.end();
    });
}

export function runGlobalPackageInstall(
    packageManager: GlobalUpdatePackageManager,
    version: string,
    { platform = process.platform }: RunGlobalPackageInstallOptions = {}
): Promise<void> {
    const executable = getPackageManagerExecutable(packageManager, platform);
    const args = packageManager === 'npm'
        ? ['install', '-g', `ccstatusline@${version}`]
        : ['add', '-g', `ccstatusline@${version}`];

    return new Promise((resolve, reject) => {
        execFile(
            executable,
            args,
            {
                timeout: GLOBAL_UPDATE_TIMEOUT_MS,
                windowsHide: true,
                ...getPackageManagerShellOptions(executable, platform)
            },
            (error) => {
                if (error) {
                    reject(error instanceof Error ? error : new Error('Global update command failed'));
                    return;
                }

                resolve();
            }
        );
    });
}

export function runGlobalUpdateAction(action: UpdateAction): Promise<void> {
    return runGlobalPackageInstall(action.packageManager, action.version);
}
