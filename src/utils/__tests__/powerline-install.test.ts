import {
    execFileSync,
    execSync
} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { installPowerlineFonts } from '../powerline';

vi.mock('node:child_process', () => ({
    execFileSync: vi.fn(),
    execSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: (file: string, args?: readonly string[]) => string) => void;
};
const mockExecSync = execSync as unknown as { mock: { calls: unknown[][] } };

const FONTS_REPO = 'https://github.com/powerline/fonts.git';

describe('installPowerlineFonts', () => {
    let home: string;

    beforeEach(() => {
        vi.clearAllMocks();
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-font-install-home-'));
        vi.spyOn(os, 'homedir').mockReturnValue(home);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(home, { recursive: true, force: true });
    });

    // os.tmpdir() is shared on Linux: a folder another account created first
    // would let it swap install.sh between the clone and running it
    it.skipIf(process.platform === 'win32')('clones into a new private folder and runs install.sh there without a shell', async () => {
        const cloneDirs: { dir: string; mode: number }[] = [];
        mockExecFileSync.mockImplementation((file, args = []) => {
            if (file === 'git') {
                const dir = args[args.length - 1] ?? '';
                cloneDirs.push({ dir, mode: fs.statSync(dir).mode & 0o777 });
                fs.writeFileSync(path.join(dir, 'install.sh'), '#!/bin/sh\n');
            }
            return '';
        });

        const result = await installPowerlineFonts();

        expect(result.success).toBe(true);
        expect(cloneDirs).toHaveLength(1);
        const { dir, mode } = cloneDirs[0] ?? { dir: '', mode: 0 };
        expect(path.dirname(dir)).toBe(os.tmpdir());
        expect(path.basename(dir)).toMatch(/^ccstatusline-powerline-fonts-/);
        expect(mode).toBe(0o700);
        expect(mockExecFileSync.mock.calls[0]?.slice(0, 2)).toEqual(['git', ['clone', '--depth=1', FONTS_REPO, dir]]);
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe(path.join(dir, 'install.sh'));
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual(expect.objectContaining({ cwd: dir }));
        expect(mockExecSync.mock.calls.filter(call => String(call[0]).includes(dir))).toEqual([]);
        expect(fs.existsSync(dir)).toBe(false);
    });

    it.skipIf(process.platform === 'win32')('removes its folder when the clone fails', async () => {
        const cloneDirs: string[] = [];
        mockExecFileSync.mockImplementation((file, args = []) => {
            cloneDirs.push(args[args.length - 1] ?? '');
            // What execFileSync throws when git isn't installed
            throw Object.assign(new Error(`spawnSync ${file} ENOENT`), { code: 'ENOENT', syscall: `spawnSync ${file}`, path: file });
        });

        const result = await installPowerlineFonts();

        expect(result).toEqual({
            success: false,
            message: 'Git is required to install Powerline fonts. Please install Git and try again.'
        });
        expect(cloneDirs).toHaveLength(1);
        expect(fs.existsSync(cloneDirs[0] ?? '')).toBe(false);
    });

    // A clone's error always starts "Command failed: git clone ...", whatever went wrong
    it.each([
        ['offline', 'Could not resolve host: github.com'],
        ['behind an unreachable proxy', 'Failed to connect to 127.0.0.1 port 9 after 0 ms: Couldn\'t connect to server']
    ])('reports why the clone failed and links the manual install when %s', async (_name, reason) => {
        const fatal = `fatal: unable to access '${FONTS_REPO}/': ${reason}`;
        mockExecFileSync.mockImplementation((file, args = []) => {
            const dir = args[args.length - 1] ?? '';
            const stderr = `Cloning into '${dir}'...\n${fatal}\n`;
            // What execFileSync throws when the command exits with an error
            throw Object.assign(new Error(`Command failed: ${file} ${args.join(' ')}\n${stderr}`), { status: 128, stderr });
        });

        const result = await installPowerlineFonts();

        expect(result).toEqual({
            success: false,
            message: `Failed to install Powerline fonts: ${fatal}. You can manually install fonts from: https://github.com/powerline/fonts`
        });
    });

    // The error repeats all of stderr, and the line that says why isn't always the last or in English
    it.each([
        [
            'git is the macOS stub for missing Command Line Tools',
            (_dir: string) => [
                'xcode-select: note: No developer tools were found, requesting install.',
                'If developer tools are located at a non-default location on disk, use `sudo xcode-select --switch path/to/Xcode.app` to specify the Xcode that you wish to use for command line developer tools, and cancel the installation dialog.',
                'See `man xcode-select` for more details.'
            ],
            { status: 1, signal: null },
            'xcode-select: note: No developer tools were found, requesting install.'
        ],
        [
            'git is killed after it starts the clone',
            (dir: string) => [`Cloning into '${dir}'...`],
            { status: null, signal: 'SIGKILL' },
            'git was stopped by SIGKILL.'
        ],
        [
            'git gives up after a dropped connection',
            (dir: string) => [
                `Cloning into '${dir}'...`,
                'error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8)',
                'error: 2771 bytes of body are still expected',
                'fetch-pack: unexpected disconnect while reading sideband packet',
                'fatal: early EOF',
                'fatal: fetch-pack: invalid index-pack output'
            ],
            { status: 128, signal: null },
            'error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8).'
        ],
        [
            'git speaks Chinese',
            (dir: string) => [
                `正克隆到 '${dir}'...`,
                `致命错误：无法访问 '${FONTS_REPO}/'：Could not resolve host: github.com`
            ],
            { status: 128, signal: null },
            `致命错误：无法访问 '${FONTS_REPO}/'：Could not resolve host: github.com.`
        ],
        [
            'git speaks French',
            (dir: string) => [
                `Clonage dans '${dir}'...`,
                `fatal : impossible d'accéder à '${FONTS_REPO}/' : Could not resolve host: github.com`
            ],
            { status: 128, signal: null },
            `fatal : impossible d'accéder à '${FONTS_REPO}/' : Could not resolve host: github.com.`
        ],
        [
            'the server says why before git does',
            (dir: string) => [
                `Clonage dans '${dir}'...`,
                'remote: Repository not found.',
                `fatal : dépôt '${FONTS_REPO}/' non trouvé`
            ],
            { status: 128, signal: null },
            'remote: Repository not found.'
        ]
    ])('reports why the clone failed when %s', async (_name, stderrLines, exit, reason) => {
        mockExecFileSync.mockImplementation((file, args = []) => {
            const stderr = `${stderrLines(args[args.length - 1] ?? '').join('\n')}\n`;
            // What execFileSync throws when the command exits with an error or is killed
            throw Object.assign(new Error(`Command failed: ${file} ${args.join(' ')}\n${stderr}`), { ...exit, stderr });
        });

        const result = await installPowerlineFonts();

        expect(result).toEqual({
            success: false,
            message: `Failed to install Powerline fonts: ${reason} You can manually install fonts from: https://github.com/powerline/fonts`
        });
    });

    it.skipIf(process.platform === 'win32')('names install.sh when it is killed', async () => {
        mockExecFileSync.mockImplementation((file, args = []) => {
            if (file === 'git') {
                fs.writeFileSync(path.join(args[args.length - 1] ?? '', 'install.sh'), '#!/bin/sh\n');
                return '';
            }
            // What execFileSync throws when the command is killed before writing to stderr
            throw Object.assign(new Error(`Command failed: ${file}`), { status: null, signal: 'SIGTERM', stderr: '' });
        });

        const result = await installPowerlineFonts();

        expect(result).toEqual({
            success: false,
            message: 'Failed to install Powerline fonts: install.sh was stopped by SIGTERM. You can manually install fonts from: https://github.com/powerline/fonts'
        });
    });
});
