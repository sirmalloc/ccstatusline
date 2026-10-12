import {
    execFileSync,
    execSync
} from 'node:child_process';
import {
    mkdirSync,
    rmSync,
    statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { installPowerlineFonts } from '../powerline';

// Upstream 6aefa6b: the font installer cloned into
// os.tmpdir()/ccstatusline-powerline-fonts-<timestamp> — a name another
// account on a shared /tmp could create first (world-writable) and then
// swap install.sh before it runs. The folder now comes from mkdtemp:
// random name, created 0700 for this account.

vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn()
}));

const mockedExecSync = execSync as unknown as { mockImplementation: (impl: (command: string) => string) => void };
const mockedExecFileSync = execFileSync as unknown as { mockImplementation: (impl: (file: string, args: string[]) => string) => void };

describe('upstream 6aefa6b: powerline fonts download into a private temp folder', () => {
    // Observation and cleanup track only the clone target the mock extracts
    // from the installer's own execFileSync call: a shared tmpdir can hold
    // leftovers from killed runs (or a real font install) that would poison a
    // prefix scan and delete other accounts' directories.
    const observed: { name: string; mode: number }[] = [];
    const cloneTargets: string[] = [];

    beforeEach(() => {
        observed.length = 0;
        cloneTargets.length = 0;
        mockedExecSync.mockImplementation(() => '');
        // git clone creates the target folder; the mock does the same so the
        // folder's name and permissions can be observed mid-install
        mockedExecFileSync.mockImplementation((file: string, args: string[]) => {
            if (file === 'git' && args[0] === 'clone') {
                const target = args.find(
                    argument => argument.startsWith(tmpdir()) && argument.includes('ccstatusline-powerline-fonts-')
                );
                if (target) {
                    mkdirSync(target, { recursive: true });
                    cloneTargets.push(target);
                    observed.push({ name: basename(target), mode: statSync(target).mode & 0o777 });
                }
            }
            return '';
        });
    });

    afterEach(() => {
        for (const target of cloneTargets) {
            rmSync(target, { recursive: true, force: true });
        }
    });

    it('downloads into a randomly named folder readable only by this account', async () => {
        await installPowerlineFonts();

        expect(observed).toHaveLength(1);
        expect(observed[0]?.name).not.toMatch(/^ccstatusline-powerline-fonts-\d+$/);
        expect(observed[0]?.mode).toBe(0o700);
    });
});
