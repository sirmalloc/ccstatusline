import {
    describe,
    expect,
    it
} from 'vitest';

import type { NativeProbeDeps } from '../terminal-native';
import {
    parsePpidFromStat,
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
