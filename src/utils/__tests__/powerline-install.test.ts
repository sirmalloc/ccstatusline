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
            throw new Error(`${file} failed`);
        });

        const result = await installPowerlineFonts();

        expect(result).toEqual({
            success: false,
            message: 'Git is required to install Powerline fonts. Please install Git and try again.'
        });
        expect(cloneDirs).toHaveLength(1);
        expect(fs.existsSync(cloneDirs[0] ?? '')).toBe(false);
    });
});
