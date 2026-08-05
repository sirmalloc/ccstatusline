import { execSync } from 'child_process';
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

import type { CustomCommandRequest } from '../custom-command';
import {
    clearCustomCommandCache,
    runCustomCommand
} from '../custom-command';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const tempPaths: string[] = [];

function useTempHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cmd-home-'));
    tempPaths.push(home);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    return home;
}

function useFixedCwd(): string {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cmd-cwd-'));
    tempPaths.push(cwd);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    return cwd;
}

function getCacheDir(home: string): string {
    return path.join(home, '.cache', 'ccstatusline', 'custom-command-cache');
}

function getOnlyCachePath(home: string): string {
    const files = fs.readdirSync(getCacheDir(home)).filter(file => /^cmd-[a-f0-9]+\.json$/.test(file));
    expect(files).toHaveLength(1);
    return path.join(getCacheDir(home), files[0] ?? '');
}

function readCacheJson(home: string): { cwd?: unknown; entries?: Record<string, unknown> } {
    return JSON.parse(fs.readFileSync(getOnlyCachePath(home), 'utf-8')) as {
        cwd?: unknown;
        entries?: Record<string, unknown>;
    };
}

function createRequest(overrides: Partial<CustomCommandRequest> = {}): CustomCommandRequest {
    return {
        command: 'my-widget',
        input: '{"session_id":"s1"}',
        timeoutMs: 1000,
        ttlSeconds: 5,
        sessionId: 's1',
        terminalWidth: 120,
        ...overrides
    };
}

describe('runCustomCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearCustomCommandCache();
    });

    afterEach(() => {
        clearCustomCommandCache();
        vi.restoreAllMocks();
        if (ORIGINAL_HOME === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = ORIGINAL_HOME;
        }
        if (ORIGINAL_USERPROFILE === undefined) {
            delete process.env.USERPROFILE;
        } else {
            process.env.USERPROFILE = ORIGINAL_USERPROFILE;
        }

        while (tempPaths.length > 0) {
            const tempPath = tempPaths.pop();
            if (tempPath) {
                fs.rmSync(tempPath, { recursive: true, force: true });
            }
        }
    });

    it('returns the trimmed stdout of the command', () => {
        useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('  branch: main \n');

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'branch: main' });
    });

    it('reuses the in-process result while the TTL holds', () => {
        useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('first');

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'first' });
        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'first' });
        expect(mockExecSync.mock.calls).toHaveLength(1);
    });

    // Claude Code runs the status line as a fresh process per repaint, so this is
    // the case the cache exists for: an in-process map alone would never hit.
    it('reuses the persisted result after the in-process cache is gone', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000);
        const home = useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('persisted');

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'persisted' });
        expect(fs.existsSync(getOnlyCachePath(home))).toBe(true);

        clearCustomCommandCache();

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'persisted' });
        expect(mockExecSync.mock.calls).toHaveLength(1);
    });

    it('runs the command again once the TTL elapses', () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
        useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('old');

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'old' });

        clearCustomCommandCache();
        nowSpy.mockReturnValue(7000);
        mockExecSync.mockReturnValueOnce('new');

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'new' });
        expect(mockExecSync.mock.calls).toHaveLength(2);
    });

    it('runs the command on every call and writes nothing when the TTL is zero', () => {
        const home = useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValue('live');

        expect(runCustomCommand(createRequest({ ttlSeconds: 0 }))).toEqual({ status: 'ok', stdout: 'live' });
        expect(runCustomCommand(createRequest({ ttlSeconds: 0 }))).toEqual({ status: 'ok', stdout: 'live' });

        expect(mockExecSync.mock.calls).toHaveLength(2);
        expect(fs.existsSync(getCacheDir(home))).toBe(false);
    });

    it('caches per command, so a different command still runs', () => {
        useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('one');
        mockExecSync.mockReturnValueOnce('two');

        expect(runCustomCommand(createRequest({ command: 'widget-one' }))).toEqual({ status: 'ok', stdout: 'one' });
        expect(runCustomCommand(createRequest({ command: 'widget-two' }))).toEqual({ status: 'ok', stdout: 'two' });
        expect(mockExecSync.mock.calls).toHaveLength(2);
    });

    it('caches per session, so a second session never reads the first session output', () => {
        useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('session one');
        mockExecSync.mockReturnValueOnce('session two');

        expect(runCustomCommand(createRequest({ sessionId: 's1' }))).toEqual({ status: 'ok', stdout: 'session one' });
        expect(runCustomCommand(createRequest({ sessionId: 's2' }))).toEqual({ status: 'ok', stdout: 'session two' });
        expect(mockExecSync.mock.calls).toHaveLength(2);
    });

    // Terminal width is part of the payload the command reads, so a resize has to
    // re-run it rather than redisplay output measured for the old width.
    it('caches per terminal width, so a resize runs the command again', () => {
        useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('narrow');
        mockExecSync.mockReturnValueOnce('wide');

        expect(runCustomCommand(createRequest({ terminalWidth: 80 }))).toEqual({ status: 'ok', stdout: 'narrow' });
        expect(runCustomCommand(createRequest({ terminalWidth: 200 }))).toEqual({ status: 'ok', stdout: 'wide' });
        expect(mockExecSync.mock.calls).toHaveLength(2);
    });

    it('caches failures too, so a broken command is not respawned every repaint', () => {
        useTempHome();
        useFixedCwd();
        mockExecSync.mockImplementation(() => {
            throw Object.assign(new Error('nope'), { status: 3 });
        });

        expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Exit: 3]' });

        clearCustomCommandCache();

        expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Exit: 3]' });
        expect(mockExecSync.mock.calls).toHaveLength(1);
    });

    it('runs the command when the persisted cache file is malformed', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000);
        const home = useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('old');

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'old' });
        fs.writeFileSync(getOnlyCachePath(home), '{ malformed json', 'utf-8');

        clearCustomCommandCache();
        mockExecSync.mockReturnValueOnce('new');

        expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'new' });
        expect(mockExecSync.mock.calls).toHaveLength(2);
    });

    it('clamps a TTL above the supported maximum instead of caching indefinitely', () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
        useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('old');

        expect(runCustomCommand(createRequest({ ttlSeconds: 6000 }))).toEqual({ status: 'ok', stdout: 'old' });

        clearCustomCommandCache();
        nowSpy.mockReturnValue(1000 + 61_000);
        mockExecSync.mockReturnValueOnce('new');

        expect(runCustomCommand(createRequest({ ttlSeconds: 6000 }))).toEqual({ status: 'ok', stdout: 'new' });
        expect(mockExecSync.mock.calls).toHaveLength(2);
    });

    // Session ids rotate, so without pruning the file would gain an entry per
    // session and never lose one.
    it('drops persisted entries that no TTL can still serve', () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
        const home = useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValue('output');

        runCustomCommand(createRequest({ sessionId: 'stale-session' }));
        expect(Object.keys(readCacheJson(home).entries ?? {})).toHaveLength(1);

        clearCustomCommandCache();
        nowSpy.mockReturnValue(1000 + 61_000);
        runCustomCommand(createRequest({ sessionId: 'fresh-session' }));

        const entries = Object.keys(readCacheJson(home).entries ?? {});
        expect(entries).toHaveLength(1);
        expect(entries[0]).toContain('fresh-session');
    });

    it('records cwd once at the file level and keys entries by command, session and width', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1000);
        const home = useTempHome();
        const cwd = useFixedCwd();
        mockExecSync.mockReturnValueOnce('output');

        runCustomCommand(createRequest());

        const cache = readCacheJson(home);
        expect(cache.cwd).toBe(cwd);
        expect(Object.keys(cache.entries ?? {})).toEqual(['my-widget\x00s1\x00120']);
    });

    // Custom command output is whatever its author chose to print, so the cache
    // file must not be readable by other accounts on the machine.
    it.skipIf(process.platform === 'win32')('writes the persisted cache owner-only', () => {
        const home = useTempHome();
        useFixedCwd();
        mockExecSync.mockReturnValueOnce('secret-ish output');

        runCustomCommand(createRequest());

        expect(fs.statSync(getOnlyCachePath(home)).mode & 0o777).toBe(0o600);
    });
});
