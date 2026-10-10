import {
    describe,
    expect,
    it
} from 'vitest';

import type { NativeProbeDeps } from '../terminal-native';
import {
    parsePpidFromStat,
    parseTtyNrFromStat,
    probeTerminalNative,
    probeWidthNative
} from '../terminal-native';

// A /proc/<pid>/stat line whose comm field contains spaces AND a close-paren.
// Naive `split(' ')[3]` gets this wrong; fields must be read after the LAST ')'.
const TRICKY_STAT = '4242 (my ) weird proc) S 1234 4242 4242 0 -1 4194304 100 0 0 0 5 3 0 0 20 0 1 0 999 0 0';

function makeDeps(overrides: Partial<NativeProbeDeps> = {}): NativeProbeDeps {
    return {
        platform: 'linux',
        readFileSync: () => { throw new Error('unexpected readFileSync'); },
        readlinkSync: () => { throw new Error('unexpected readlinkSync'); },
        openSync: () => 7,
        closeSync: () => undefined,
        isatty: () => true,
        getColumns: () => 209,
        ...overrides
    };
}

describe('parsePpidFromStat', () => {
    it('parses the ppid when comm contains spaces and parens', () => {
        expect(parsePpidFromStat(TRICKY_STAT)).toBe(1234);
    });

    it('returns null on garbage', () => {
        expect(parsePpidFromStat('not a stat line')).toBeNull();
    });
});

describe('parseTtyNrFromStat', () => {
    it('parses tty_nr when comm contains spaces and parens', () => {
        expect(parseTtyNrFromStat('4242 (my ) weird proc) S 1234 4242 4242 34818 -1 0')).toBe(34818);
        expect(parseTtyNrFromStat(TRICKY_STAT)).toBe(0);
    });

    it('returns null on garbage', () => {
        expect(parseTtyNrFromStat('not a stat line')).toBeNull();
        expect(parseTtyNrFromStat('1 (node) S 2')).toBeNull();
    });
});

describe('probeWidthNative', () => {
    it('returns null on non-linux platforms', () => {
        expect(probeWidthNative(makeDeps({ platform: 'darwin' }))).toBeNull();
    });

    it('walks ancestors and returns the width of the first tty found', () => {
        const deps = makeDeps({
            // self -> 4242 -> 1234. Only 1234 owns a pty.
            readFileSync: (p: string) => {
                if (p === `/proc/${process.pid}/stat`) {
                    return '1 (node) S 4242 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 0 0';
                }

                if (p === '/proc/4242/stat') {
                    return TRICKY_STAT;
                }

                throw new Error(`no such stat: ${p}`);
            },
            readlinkSync: (p: string) => {
                if (p === '/proc/1234/fd/0') {
                    return '/dev/pts/7';
                }

                throw new Error(`not a tty fd: ${p}`);
            },
            getColumns: () => 209
        });

        expect(probeWidthNative(deps)).toBe(209);
    });

    it('returns null when no ancestor owns a tty', () => {
        const deps = makeDeps({
            readFileSync: () => '1 (node) S 0 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 0 0',
            readlinkSync: () => { throw new Error('ENOENT'); }
        });

        expect(probeWidthNative(deps)).toBeNull();
    });

    it('returns null (and does not throw) when the device is not a tty', () => {
        const deps = makeDeps({
            readFileSync: (p: string) => (p === `/proc/${process.pid}/stat`
                ? '1 (node) S 1234 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 0 0'
                : (() => { throw new Error('stop'); })()),
            readlinkSync: () => '/dev/pts/7',
            isatty: () => false
        });

        expect(probeWidthNative(deps)).toBeNull();
    });

    it('closes the fd even when getColumns throws', () => {
        const closed: number[] = [];
        const deps = makeDeps({
            readFileSync: (p: string) => (p === `/proc/${process.pid}/stat`
                ? '1 (node) S 1234 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 0 0'
                : (() => { throw new Error('stop'); })()),
            readlinkSync: () => '/dev/pts/7',
            closeSync: (fd: number) => { closed.push(fd); },
            getColumns: () => { throw new Error('ioctl failed'); }
        });

        expect(probeWidthNative(deps)).toBeNull();
        expect(closed).toEqual([7]);
    });
});

describe('probeTerminalNative', () => {
    // Stat line for `pid` with parent `ppid` and controlling terminal `ttyNr`.
    const stat = (pid: number, ppid: number, ttyNr = 0): string => `${pid} (proc) S ${ppid} ${pid} ${pid} ${ttyNr} -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1 0 0`;

    // self -> 300 -> 200 -> 1, no fd of any ancestor points at a tty.
    function chainDeps(ttyNrs: Record<number, number> = {}, unreadable: number[] = []): NativeProbeDeps {
        const parents: Record<number, number> = { [process.pid]: 300, 300: 200, 200: 1, 1: 0 };
        return makeDeps({
            readFileSync: (p: string) => {
                const pid = Number(/^\/proc\/(\d+)\/stat$/.exec(p)?.[1]);
                const ppid = parents[pid];
                if (ppid === undefined || unreadable.includes(pid)) {
                    throw new Error(`EACCES: ${p}`);
                }

                return stat(pid, ppid, ttyNrs[pid] ?? 0);
            },
            readlinkSync: () => '/dev/null'
        });
    }

    it('is conclusive when no ancestor (including pid 1) has a controlling terminal', () => {
        expect(probeTerminalNative(chainDeps())).toEqual({ width: null, noControllingTTY: true });
    });

    it('is inconclusive when an ancestor has a controlling terminal but no tty on its stdio', () => {
        // e.g. stdio redirected away from the terminal: ps -o tty= still reports it.
        expect(probeTerminalNative(chainDeps({ 200: 34818 }))).toEqual({ width: null, noControllingTTY: false });
    });

    it('is inconclusive when pid 1 has a controlling terminal', () => {
        // The ps walk queries pid 1's tty too (e.g. an interactive shell as a container's init).
        expect(probeTerminalNative(chainDeps({ 1: 34816 }))).toEqual({ width: null, noControllingTTY: false });
    });

    it('is inconclusive when an ancestor stat cannot be read', () => {
        expect(probeTerminalNative(chainDeps({}, [200])).noControllingTTY).toBe(false);
        expect(probeTerminalNative(chainDeps({}, [1])).noControllingTTY).toBe(false);
    });

    it('ignores our own controlling terminal, which the ps walk never checks', () => {
        expect(probeTerminalNative(chainDeps({ [process.pid]: 34818 })).noControllingTTY).toBe(true);
    });

    it('checks the last ancestor when the depth limit is reached', () => {
        // An endless chain: self -> 1000 -> 1001 -> ... The 8th ancestor is 1007.
        const deps = (lastTtyNr: number) => makeDeps({
            readFileSync: (p: string) => {
                const pid = Number(/^\/proc\/(\d+)\/stat$/.exec(p)?.[1]);
                const next = pid === process.pid ? 1000 : pid + 1;
                return stat(pid, next, pid === 1007 ? lastTtyNr : 0);
            },
            readlinkSync: () => '/dev/null'
        });

        expect(probeTerminalNative(deps(0)).noControllingTTY).toBe(true);
        expect(probeTerminalNative(deps(34818)).noControllingTTY).toBe(false);
    });

    it('is inconclusive on non-linux platforms', () => {
        expect(probeTerminalNative(makeDeps({ platform: 'darwin' }))).toEqual({ width: null, noControllingTTY: false });
    });

    it('reports a found width', () => {
        const deps = chainDeps({ 200: 34818 });
        expect(probeTerminalNative({ ...deps, readlinkSync: (p: string) => (p === '/proc/200/fd/1' ? '/dev/pts/2' : '/dev/null') }))
            .toEqual({ width: 209, noControllingTTY: false });
    });
});
