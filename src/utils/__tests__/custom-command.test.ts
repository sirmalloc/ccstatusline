import type { SpawnSyncReturns } from 'child_process';
import { spawnSync } from 'child_process';
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

interface SpawnOptions {
    shell?: boolean;
    detached?: boolean;
    windowsHide?: boolean;
    timeout?: number;
    maxBuffer?: number;
    input?: string;
    stdio?: (string | number)[];
}

const mockSpawnSync = spawnSync as unknown as {
    mock: { calls: [string, SpawnOptions][] };
    mockImplementation: (impl: (command: string, options: SpawnOptions) => SpawnSyncReturns<string>) => void;
};

/** One scripted command run: what it prints, and how it terminated. */
interface CommandResponse {
    stdout?: string;
    result?: Partial<SpawnSyncReturns<string>>;
}

const CHILD_PID = 4242;
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const tempPaths: string[] = [];
let platformDescriptor: PropertyDescriptor | undefined;
let responses: CommandResponse[] = [];
let fallbackResponse: CommandResponse = {};

function spawnResult(overrides: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
    return {
        pid: CHILD_PID,
        output: [],
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        ...overrides
    };
}

function errnoError(code: string): Error {
    return Object.assign(new Error(code), { code });
}

/** Queues one response per upcoming run, in order. */
function queueRuns(...items: CommandResponse[]): void {
    responses.push(...items);
}

/** Sets the response for every run with no queued entry left. */
function alwaysRespond(item: CommandResponse): void {
    fallbackResponse = item;
}

function lastSpawnOptions(): SpawnOptions {
    const call = mockSpawnSync.mock.calls[mockSpawnSync.mock.calls.length - 1];
    if (!call)
        throw new Error('expected a spawn call');
    return call[1];
}

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

function useTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cmd-tmp-'));
    tempPaths.push(dir);
    vi.spyOn(os, 'tmpdir').mockReturnValue(dir);
    return dir;
}

// process.kill must never run for real here: the tests feed it a pid that this
// machine may well have assigned to something unrelated.
function useKillSpy() {
    return vi.spyOn(process, 'kill').mockImplementation(() => true);
}

/** Runs the rest of the test as if it were on the given platform. */
function usePlatform(platform: NodeJS.Platform): void {
    platformDescriptor ??= Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {
        value: platform,
        configurable: true
    });
}

function restorePlatform(): void {
    if (platformDescriptor) {
        Object.defineProperty(process, 'platform', platformDescriptor);
        platformDescriptor = undefined;
    }
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
        responses = [];
        fallbackResponse = {};

        // Stand in for the command itself: write the scripted output to whichever
        // stdout the caller handed over, then report how the process ended.
        mockSpawnSync.mockImplementation((_command, options) => {
            const response = responses.shift() ?? fallbackResponse;
            const target = options.stdio?.[1];

            if (typeof target === 'number' && response.stdout !== undefined) {
                fs.writeSync(target, response.stdout);
            }

            return spawnResult({ stdout: response.stdout ?? '', ...response.result });
        });
    });

    afterEach(() => {
        clearCustomCommandCache();
        vi.restoreAllMocks();
        restorePlatform();
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

    describe('caching', () => {
        it('returns the trimmed stdout of the command', () => {
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: '  branch: main \n' });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'branch: main' });
        });

        it('reuses the in-process result while the TTL holds', () => {
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'first' }, { stdout: 'second' });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'first' });
            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'first' });
            expect(mockSpawnSync.mock.calls).toHaveLength(1);
        });

        // Claude Code runs the status line as a fresh process per repaint, so this
        // is the case the cache exists for: an in-process map would never hit.
        it('reuses the persisted result after the in-process cache is gone', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            const home = useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'persisted' }, { stdout: 'rerun' });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'persisted' });
            expect(fs.existsSync(getOnlyCachePath(home))).toBe(true);

            clearCustomCommandCache();

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'persisted' });
            expect(mockSpawnSync.mock.calls).toHaveLength(1);
        });

        it('runs the command again once the TTL elapses', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'old' }, { stdout: 'new' });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'old' });

            clearCustomCommandCache();
            nowSpy.mockReturnValue(7000);

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'new' });
            expect(mockSpawnSync.mock.calls).toHaveLength(2);
        });

        // The TTL has to start when the output became available. Measuring from
        // before the run would leave anything slower than the TTL uncacheable,
        // which is exactly the case worth caching.
        it('gives a slow command a full TTL measured from when it finished', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            useTempHome();
            useFixedCwd();
            mockSpawnSync.mockImplementation((_command, options) => {
                // The command occupies 2s, twice the TTL under test.
                nowSpy.mockReturnValue(3000);
                const target = options.stdio?.[1];
                if (typeof target === 'number') {
                    fs.writeSync(target, 'slow');
                }
                return spawnResult({ stdout: 'slow' });
            });

            expect(runCustomCommand(createRequest({ ttlSeconds: 1 }))).toEqual({ status: 'ok', stdout: 'slow' });

            clearCustomCommandCache();
            nowSpy.mockReturnValue(3500);

            expect(runCustomCommand(createRequest({ ttlSeconds: 1 }))).toEqual({ status: 'ok', stdout: 'slow' });
            expect(mockSpawnSync.mock.calls).toHaveLength(1);
        });

        it('runs the command on every call and writes nothing when the TTL is zero', () => {
            const home = useTempHome();
            useFixedCwd();
            alwaysRespond({ stdout: 'live' });

            expect(runCustomCommand(createRequest({ ttlSeconds: 0 }))).toEqual({ status: 'ok', stdout: 'live' });
            expect(runCustomCommand(createRequest({ ttlSeconds: 0 }))).toEqual({ status: 'ok', stdout: 'live' });

            expect(mockSpawnSync.mock.calls).toHaveLength(2);
            expect(fs.existsSync(getCacheDir(home))).toBe(false);
        });

        // Caching is opt-in, so an absent setting has to behave exactly as it did
        // before the setting existed.
        it('runs the command on every call when no TTL is configured', () => {
            const home = useTempHome();
            useFixedCwd();
            alwaysRespond({ stdout: 'live' });

            runCustomCommand(createRequest({ ttlSeconds: undefined }));
            runCustomCommand(createRequest({ ttlSeconds: undefined }));

            expect(mockSpawnSync.mock.calls).toHaveLength(2);
            expect(fs.existsSync(getCacheDir(home))).toBe(false);
        });

        it('caches per command, so a different command still runs', () => {
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'one' }, { stdout: 'two' });

            expect(runCustomCommand(createRequest({ command: 'widget-one' }))).toEqual({ status: 'ok', stdout: 'one' });
            expect(runCustomCommand(createRequest({ command: 'widget-two' }))).toEqual({ status: 'ok', stdout: 'two' });
            expect(mockSpawnSync.mock.calls).toHaveLength(2);
        });

        // Two widgets can run the same command under different timeouts. Without
        // the timeout in the key the second would inherit the first's [Timeout].
        it('caches per timeout, so a longer-lived widget runs on its own terms', () => {
            useTempHome();
            useFixedCwd();
            useKillSpy();
            queueRuns(
                { result: { error: errnoError('ETIMEDOUT'), signal: 'SIGTERM' } },
                { stdout: 'finished in time' }
            );

            expect(runCustomCommand(createRequest({ timeoutMs: 100 }))).toEqual({ status: 'failed', marker: '[Timeout]' });
            expect(runCustomCommand(createRequest({ timeoutMs: 5000 }))).toEqual({ status: 'ok', stdout: 'finished in time' });
            expect(mockSpawnSync.mock.calls).toHaveLength(2);
        });

        it('caches per session, so a second session never reads the first session output', () => {
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'session one' }, { stdout: 'session two' });

            expect(runCustomCommand(createRequest({ sessionId: 's1' }))).toEqual({ status: 'ok', stdout: 'session one' });
            expect(runCustomCommand(createRequest({ sessionId: 's2' }))).toEqual({ status: 'ok', stdout: 'session two' });
            expect(mockSpawnSync.mock.calls).toHaveLength(2);
        });

        // Without a session id there is nothing to separate one session's output
        // from another's, so the shared file has to stay out of it.
        it('keeps output out of the shared file when the session id is missing', () => {
            const home = useTempHome();
            useFixedCwd();
            alwaysRespond({ stdout: 'unattributed' });

            expect(runCustomCommand(createRequest({ sessionId: undefined }))).toEqual({ status: 'ok', stdout: 'unattributed' });

            expect(fs.existsSync(getCacheDir(home))).toBe(false);
        });

        it('still reuses a session-less result inside the same process', () => {
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'once' }, { stdout: 'twice' });

            runCustomCommand(createRequest({ sessionId: undefined }));
            runCustomCommand(createRequest({ sessionId: undefined }));

            expect(mockSpawnSync.mock.calls).toHaveLength(1);
        });

        // Terminal width is part of the payload the command reads, so a resize has
        // to re-run it rather than redisplay output measured for the old width.
        it('caches per terminal width, so a resize runs the command again', () => {
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'narrow' }, { stdout: 'wide' });

            expect(runCustomCommand(createRequest({ terminalWidth: 80 }))).toEqual({ status: 'ok', stdout: 'narrow' });
            expect(runCustomCommand(createRequest({ terminalWidth: 200 }))).toEqual({ status: 'ok', stdout: 'wide' });
            expect(mockSpawnSync.mock.calls).toHaveLength(2);
        });

        it('caches failures too, so a broken command is not respawned every repaint', () => {
            useTempHome();
            useFixedCwd();
            alwaysRespond({ result: { status: 3 } });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Exit: 3]' });

            clearCustomCommandCache();

            expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Exit: 3]' });
            expect(mockSpawnSync.mock.calls).toHaveLength(1);
        });

        it('runs the command when the persisted cache file is malformed', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            const home = useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'old' }, { stdout: 'new' });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'old' });
            fs.writeFileSync(getOnlyCachePath(home), '{ malformed json', 'utf-8');

            clearCustomCommandCache();

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: 'new' });
            expect(mockSpawnSync.mock.calls).toHaveLength(2);
        });

        it('clamps a TTL above the supported maximum instead of caching indefinitely', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'old' }, { stdout: 'new' });

            expect(runCustomCommand(createRequest({ ttlSeconds: 6000 }))).toEqual({ status: 'ok', stdout: 'old' });

            clearCustomCommandCache();
            nowSpy.mockReturnValue(1000 + 61_000);

            expect(runCustomCommand(createRequest({ ttlSeconds: 6000 }))).toEqual({ status: 'ok', stdout: 'new' });
            expect(mockSpawnSync.mock.calls).toHaveLength(2);
        });

        // Every widget in a render pass rewrites this file whole, so one chatty
        // command would otherwise make the pass quadratic in its output size.
        it('caps how much output can enter the cache', () => {
            const home = useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'x'.repeat(80_000) });

            const result = runCustomCommand(createRequest());

            expect(result.status).toBe('ok');
            expect(result.status === 'ok' && result.stdout.length).toBe(16_384);
            expect(fs.statSync(getOnlyCachePath(home)).size).toBeLessThan(32_768);
        });

        // Session ids rotate, so without pruning the file would gain an entry per
        // session and never lose one.
        it('drops persisted entries that no TTL can still serve', () => {
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
            const home = useTempHome();
            useFixedCwd();
            alwaysRespond({ stdout: 'output' });

            runCustomCommand(createRequest({ sessionId: 'stale-session' }));
            expect(Object.keys(readCacheJson(home).entries ?? {})).toHaveLength(1);

            clearCustomCommandCache();
            nowSpy.mockReturnValue(1000 + 61_000);
            runCustomCommand(createRequest({ sessionId: 'fresh-session' }));

            const entries = Object.keys(readCacheJson(home).entries ?? {});
            expect(entries).toHaveLength(1);
            expect(entries[0]).toContain('fresh-session');
        });

        it('records cwd once at the file level and keys entries by command, timeout, session and width', () => {
            vi.spyOn(Date, 'now').mockReturnValue(1000);
            const home = useTempHome();
            const cwd = useFixedCwd();
            queueRuns({ stdout: 'output' });

            runCustomCommand(createRequest());

            const cache = readCacheJson(home);
            expect(cache.cwd).toBe(cwd);
            expect(Object.keys(cache.entries ?? {})).toEqual(['my-widget\x001000\x00s1\x00120']);
        });

        // Custom command output is whatever its author chose to print, so the cache
        // file must not be readable by other accounts on the machine.
        it.skipIf(process.platform === 'win32')('writes the persisted cache owner-only', () => {
            const home = useTempHome();
            useFixedCwd();
            queueRuns({ stdout: 'secret-ish output' });

            runCustomCommand(createRequest());

            expect(fs.statSync(getOnlyCachePath(home)).mode & 0o777).toBe(0o600);
        });
    });

    describe('process handling', () => {
        it('runs the command line through a shell with a pinned output ceiling', () => {
            useTempHome();
            useFixedCwd();

            runCustomCommand(createRequest({ command: 'curl -s example | jq -r .x' }));

            expect(mockSpawnSync.mock.calls[0]?.[0]).toBe('curl -s example | jq -r .x');
            expect(lastSpawnOptions().shell).toBe(true);
            expect(lastSpawnOptions().timeout).toBe(1000);
            expect(lastSpawnOptions().windowsHide).toBe(true);
            expect(lastSpawnOptions().maxBuffer).toBe(1024 * 1024);
        });

        // Every process in the shell tree inherits the pipe handles, and spawnSync
        // waits for all of them to close. One backgrounded descendant would hold
        // the render open past the timeout, so neither stream is a pipe.
        it('gives the command files for stdin and stdout rather than pipes', () => {
            useTempHome();
            useFixedCwd();
            let deliveredPayload: string | null = null;
            mockSpawnSync.mockImplementation((_command, options) => {
                const stdin = options.stdio?.[0];
                deliveredPayload = typeof stdin === 'number' ? fs.readFileSync(stdin, 'utf-8') : null;
                const target = options.stdio?.[1];
                if (typeof target === 'number') {
                    fs.writeSync(target, 'from the file');
                }
                return spawnResult();
            });

            const result = runCustomCommand(createRequest({ input: '{"session_id":"s1","terminal_width":120}' }));

            expect(deliveredPayload).toBe('{"session_id":"s1","terminal_width":120}');
            expect(result).toEqual({ status: 'ok', stdout: 'from the file' });
            expect(lastSpawnOptions().input).toBeUndefined();
            expect(typeof lastSpawnOptions().stdio?.[1]).toBe('number');
            expect(lastSpawnOptions().stdio?.[2]).toBe('ignore');
        });

        it('removes the working directory once the command returns', () => {
            useTempHome();
            useFixedCwd();
            const tempDir = useTempDir();

            runCustomCommand(createRequest());

            expect(fs.readdirSync(tempDir)).toEqual([]);
        });

        it('removes the working directory even when the command times out', () => {
            useTempHome();
            useFixedCwd();
            const tempDir = useTempDir();
            useKillSpy();
            alwaysRespond({ result: { error: errnoError('ETIMEDOUT'), signal: 'SIGTERM' } });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Timeout]' });
            expect(fs.readdirSync(tempDir)).toEqual([]);
        });

        // A predictable path could be pre-created as a symlink, or swapped between
        // being written and being opened. mkdtemp rules both out.
        it('uses a fresh unguessable directory for every run', () => {
            useTempHome();
            useFixedCwd();
            const tempDir = useTempDir();
            const seen: string[] = [];
            mockSpawnSync.mockImplementation(() => {
                seen.push(fs.readdirSync(tempDir)[0] ?? '');
                return spawnResult();
            });

            runCustomCommand(createRequest({ ttlSeconds: 0 }));
            runCustomCommand(createRequest({ ttlSeconds: 0 }));

            expect(seen).toHaveLength(2);
            expect(seen[0]).not.toBe(seen[1]);
            expect(seen[0]).toMatch(/^ccstatusline-cmd-/);
        });

        it.skipIf(process.platform === 'win32')('keeps the working directory owner-only', () => {
            useTempHome();
            useFixedCwd();
            const tempDir = useTempDir();
            let mode: number | null = null;
            mockSpawnSync.mockImplementation(() => {
                const entry = fs.readdirSync(tempDir)[0];
                mode = entry ? fs.statSync(path.join(tempDir, entry)).mode & 0o777 : null;
                return spawnResult();
            });

            runCustomCommand(createRequest());

            expect(mode).toBe(0o700);
        });

        // Killing the shell alone leaves a pipeline's other members running. The
        // shell leads its own process group, so the negated pid reaches all of them.
        it('kills the whole process group when a command times out on POSIX', () => {
            useTempHome();
            useFixedCwd();
            usePlatform('linux');
            const killSpy = useKillSpy();
            alwaysRespond({ result: { error: errnoError('ETIMEDOUT'), signal: 'SIGTERM' } });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Timeout]' });

            expect(lastSpawnOptions().detached).toBe(true);
            expect(killSpy.mock.calls).toEqual([[-CHILD_PID, 'SIGKILL']]);
        });

        // detached would give the child its own console on Windows, and spawnSync
        // has already terminated the shell by the time it returns, so there is no
        // live pid for taskkill /T to walk down from.
        it('does not detach or group-kill on Windows', () => {
            useTempHome();
            useFixedCwd();
            usePlatform('win32');
            const killSpy = useKillSpy();
            alwaysRespond({ result: { error: errnoError('ETIMEDOUT'), signal: 'SIGTERM' } });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Timeout]' });

            expect(lastSpawnOptions().detached).toBe(false);
            expect(killSpy.mock.calls).toEqual([]);
        });

        // A command that exited on its own may have deliberately left a background
        // job running, so only a timeout justifies tearing the group down.
        it('leaves the process group alone when the command exits on its own', () => {
            useTempHome();
            useFixedCwd();
            const killSpy = useKillSpy();
            alwaysRespond({ result: { status: 7 } });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: '[Exit: 7]' });
            expect(killSpy.mock.calls).toEqual([]);
        });
    });

    describe('failure markers', () => {
        const cases: { name: string; result: Partial<SpawnSyncReturns<string>>; marker: string }[] = [
            { name: 'a missing shell', result: { error: errnoError('ENOENT') }, marker: '[Cmd not found]' },
            { name: 'a timeout', result: { error: errnoError('ETIMEDOUT'), signal: 'SIGTERM' }, marker: '[Timeout]' },
            { name: 'a permission failure', result: { error: errnoError('EACCES') }, marker: '[Permission denied]' },
            { name: 'an unclassified spawn error', result: { error: new Error('boom') }, marker: '[Error]' },
            { name: 'a signalled command', result: { signal: 'SIGKILL', status: null }, marker: '[Signal: SIGKILL]' },
            { name: 'a non-zero exit', result: { status: 12 }, marker: '[Exit: 12]' },
            { name: 'a missing exit status', result: { status: null }, marker: '[Error]' }
        ];

        for (const testCase of cases) {
            it(`reports ${testCase.name} as ${testCase.marker}`, () => {
                useTempHome();
                useFixedCwd();
                useKillSpy();
                alwaysRespond({ result: testCase.result });

                expect(runCustomCommand(createRequest())).toEqual({ status: 'failed', marker: testCase.marker });
            });
        }

        it('treats a zero exit with empty output as success', () => {
            useTempHome();
            useFixedCwd();
            alwaysRespond({ stdout: '' });

            expect(runCustomCommand(createRequest())).toEqual({ status: 'ok', stdout: '' });
        });
    });
});
