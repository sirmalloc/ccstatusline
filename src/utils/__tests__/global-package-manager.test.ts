import * as childProcess from 'child_process';
import * as fs from 'fs';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    inspectActiveGlobalCommand,
    inspectGlobalPackageInstallations,
    runGlobalPackageUninstall
} from '../global-package-manager';

function mockExecFileSync(responses: Record<string, string>) {
    return vi.spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
        const key = `${command} ${(args as string[]).join(' ')}`;
        const response = responses[key];

        if (response === undefined) {
            throw new Error(`Unexpected command: ${key}`);
        }

        return response;
    });
}

describe('global package manager inspection', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('detects npm installs through WSL path variants', () => {
        mockExecFileSync({
            'which -a ccstatusline': '',
            'npm prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === '/mnt/c/Users/Alice/AppData/Roaming/npm/ccstatusline'
        ));

        const installations = inspectGlobalPackageInstallations({
            commandAvailability: {
                npm: true,
                bun: false
            },
            platform: 'linux'
        });

        expect(installations).toEqual([
            {
                packageManager: 'npm',
                available: true,
                installed: true,
                binDir: 'C:\\Users\\Alice\\AppData\\Roaming\\npm'
            },
            {
                packageManager: 'bun',
                available: false,
                installed: false,
                binDir: null
            }
        ]);
    });

    it('identifies the active package manager and version from the first PATH match', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/Users/alice/.bun/bin/ccstatusline\n/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline\n',
            'npm prefix -g': '/Users/alice/.nvm/versions/node/v24.9.0\n',
            'bun pm bin -g': '/Users/alice/.bun/bin\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json'
        ));
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json') {
                return '{"version":"2.2.13"}';
            }

            throw new Error(`Unexpected read: ${String(filePath)}`);
        });

        const activeCommand = inspectActiveGlobalCommand({
            commandAvailability: {
                npm: true,
                bun: true
            },
            platform: 'darwin'
        });

        expect(activeCommand).toEqual({
            packageManager: 'bun',
            resolvedPath: '/Users/alice/.bun/bin/ccstatusline',
            resolvedPaths: [
                '/Users/alice/.bun/bin/ccstatusline',
                '/Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline'
            ],
            binDir: '/Users/alice/.bun/bin',
            version: '2.2.13',
            warning: '⚠ Multiple ccstatusline binaries are on PATH. Claude Code will run the first match: /Users/alice/.bun/bin/ccstatusline.\nOther matches: /Users/alice/.nvm/versions/node/v24.9.0/bin/ccstatusline'
        });
    });

    it('ignores transient bunx status line shims when identifying the active global command', () => {
        mockExecFileSync({
            'which -a ccstatusline': '/var/folders/demo/T/bunx-501-ccstatusline@latest/node_modules/.bin/ccstatusline\n/Users/alice/.bun/bin/ccstatusline\n',
            'npm prefix -g': '/Users/alice/.nvm/versions/node/v24.9.0\n',
            'bun pm bin -g': '/Users/alice/.bun/bin\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json'
        ));
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === '/Users/alice/.bun/install/global/node_modules/ccstatusline/package.json') {
                return '{"version":"2.2.14"}';
            }

            throw new Error(`Unexpected read: ${String(filePath)}`);
        });

        const activeCommand = inspectActiveGlobalCommand({
            commandAvailability: {
                npm: true,
                bun: true
            },
            platform: 'darwin'
        });

        expect(activeCommand).toEqual({
            packageManager: 'bun',
            resolvedPath: '/Users/alice/.bun/bin/ccstatusline',
            resolvedPaths: ['/Users/alice/.bun/bin/ccstatusline'],
            binDir: '/Users/alice/.bun/bin',
            version: '2.2.14',
            warning: null
        });
    });

    it('uses npm.cmd for Windows npm version lookup', () => {
        mockExecFileSync({
            'where ccstatusline': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd\r\n',
            'npm.cmd prefix -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\r\n',
            'npm.cmd root -g': 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\node_modules\r\n'
        });
        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => (
            filePath === 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\node_modules\\ccstatusline\\package.json'
        ));
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (filePath === 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\node_modules\\ccstatusline\\package.json') {
                return '{"version":"2.2.13"}';
            }

            throw new Error(`Unexpected read: ${String(filePath)}`);
        });

        const activeCommand = inspectActiveGlobalCommand({
            commandAvailability: {
                npm: true,
                bun: false
            },
            platform: 'win32'
        });

        expect(activeCommand).toEqual({
            packageManager: 'npm',
            resolvedPath: 'C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd',
            resolvedPaths: ['C:\\Users\\Alice\\AppData\\Roaming\\npm\\ccstatusline.cmd'],
            binDir: 'C:\\Users\\Alice\\AppData\\Roaming\\npm',
            version: '2.2.13',
            warning: null
        });
    });

    it('uses npm.cmd for Windows npm uninstalls', async () => {
        const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((...args: unknown[]) => {
            const callback = args[3] as (error: Error | null) => void;
            callback(null);
            return {};
        }) as typeof childProcess.execFile);

        await runGlobalPackageUninstall('npm', { platform: 'win32' });

        expect(execFileSpy.mock.calls[0]?.[0]).toBe('npm.cmd');
        expect(execFileSpy.mock.calls[0]?.[1]).toEqual(['uninstall', '-g', 'ccstatusline']);
    });
});
