import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import {
    DEV_RELOAD_EXIT_CODE,
    getDevReloadMode,
    getDevReloadStateFile,
    isDevReloadRequested,
    promptRetryOnTerminal,
    readDevReloadSnapshot,
    requestDevReload,
    runDevReloadSupervisor,
    superviseDevReload,
    writeDevReloadSnapshot,
    type DevReloadSnapshot
} from '../dev-reload';

describe('getDevReloadMode', () => {
    it('is off unless CCSTATUSLINE_DEV_RELOAD is 1', () => {
        expect(getDevReloadMode({})).toBe('off');
        expect(getDevReloadMode({ CCSTATUSLINE_DEV_RELOAD: '0' })).toBe('off');
        expect(getDevReloadMode({ CCSTATUSLINE_DEV_RELOAD_STATE: '/tmp/x.json' })).toBe('off');
    });

    it('supervises from the first launch and runs the TUI in the children it starts', () => {
        expect(getDevReloadMode({ CCSTATUSLINE_DEV_RELOAD: '1' })).toBe('supervisor');
        expect(getDevReloadMode({ CCSTATUSLINE_DEV_RELOAD: '1', CCSTATUSLINE_DEV_RELOAD_STATE: '/tmp/x.json' })).toBe('child');
    });
});

describe('getDevReloadStateFile', () => {
    it('is the snapshot path only in a child the supervisor started', () => {
        expect(getDevReloadStateFile({ CCSTATUSLINE_DEV_RELOAD: '1', CCSTATUSLINE_DEV_RELOAD_STATE: '/tmp/x.json' })).toBe('/tmp/x.json');
        expect(getDevReloadStateFile({ CCSTATUSLINE_DEV_RELOAD: '1' })).toBeNull();
        expect(getDevReloadStateFile({ CCSTATUSLINE_DEV_RELOAD_STATE: '/tmp/x.json' })).toBeNull();
    });
});

describe('requestDevReload', () => {
    it('marks the reload for when the TUI exits', () => {
        requestDevReload();

        expect(isDevReloadRequested()).toBe(true);
    });
});

describe('runDevReloadSupervisor', () => {
    function makeDeps(exitCodes: number[], retryAnswers: boolean[] = []) {
        const codes = [...exitCodes];
        const answers = [...retryAnswers];
        return {
            launch: vi.fn(() => codes.shift() ?? 0),
            promptRetry: vi.fn((_code: number) => Promise.resolve(answers.shift() ?? false)),
            cleanup: vi.fn()
        };
    }

    it('relaunches after every reload and stops when the TUI exits normally', async () => {
        const deps = makeDeps([DEV_RELOAD_EXIT_CODE, DEV_RELOAD_EXIT_CODE, 0]);

        expect(await runDevReloadSupervisor(deps)).toBe(0);
        expect(deps.launch).toHaveBeenCalledTimes(3);
        expect(deps.promptRetry).not.toHaveBeenCalled();
        expect(deps.cleanup).toHaveBeenCalledTimes(1);
    });

    it('offers a retry when the TUI crashes, e.g. on code that is mid-edit', async () => {
        const deps = makeDeps([DEV_RELOAD_EXIT_CODE, 1, 0], [true]);

        expect(await runDevReloadSupervisor(deps)).toBe(0);
        expect(deps.promptRetry).toHaveBeenCalledWith(1);
        expect(deps.launch).toHaveBeenCalledTimes(3);
    });

    it('exits with the crash code when the retry is declined', async () => {
        const deps = makeDeps([1], [false]);

        expect(await runDevReloadSupervisor(deps)).toBe(1);
        expect(deps.launch).toHaveBeenCalledTimes(1);
        expect(deps.cleanup).toHaveBeenCalledTimes(1);
    });
});

describe('superviseDevReload', () => {
    it('relaunches this command with a snapshot path, and removes the snapshot when done', async () => {
        const launches: { command: string; args: string[]; stateFile: string | undefined }[] = [];
        const spawn = vi.fn((command: string, args: string[], env: NodeJS.ProcessEnv) => {
            const stateFile = env.CCSTATUSLINE_DEV_RELOAD_STATE;
            launches.push({ command, args, stateFile });
            if (launches.length > 1 || !stateFile) {
                return 0;
            }
            // The first child leaves a snapshot behind and asks for a reload
            fs.writeFileSync(stateFile, '{}');
            return DEV_RELOAD_EXIT_CODE;
        });

        expect(await superviseDevReload(['--config', 'x.json'], spawn)).toBe(0);

        expect(launches).toHaveLength(2);
        expect(launches[0]?.command).toBe(process.execPath);
        expect(launches[0]?.args.slice(-2)).toEqual(['--config', 'x.json']);
        const stateFile = launches[0]?.stateFile ?? '';
        expect(path.basename(stateFile)).toBe(`ccstatusline-dev-reload-${process.pid}.json`);
        expect(launches[1]?.stateFile).toBe(stateFile);
        expect(fs.existsSync(stateFile)).toBe(false);
    });
});

describe('promptRetryOnTerminal', () => {
    function makeTerminal() {
        const stdin = Object.assign(new PassThrough(), { setRawMode: vi.fn<(mode: boolean) => void>() });
        const stdout = new PassThrough();
        const written: string[] = [];
        stdout.on('data', (chunk: Buffer) => {
            written.push(chunk.toString());
        });
        return {
            stdin,
            output: () => written.join(''),
            terminal: {
                stdin: stdin as unknown as NodeJS.ReadStream,
                stdout: stdout as unknown as NodeJS.WriteStream
            }
        };
    }

    it('retries on Enter, ignoring other keys, and hands the terminal back', async () => {
        const { stdin, output, terminal } = makeTerminal();
        const answer = promptRetryOnTerminal(1, terminal);

        stdin.write('x');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        stdin.write('\r');

        expect(await answer).toBe(true);
        expect(output()).toContain('Reload failed (exit 1)');
        expect(stdin.setRawMode).toHaveBeenLastCalledWith(false);
    });

    it('gives up on q', async () => {
        const { stdin, terminal } = makeTerminal();
        const answer = promptRetryOnTerminal(2, terminal);

        stdin.write('q');

        expect(await answer).toBe(false);
    });
});

describe('dev reload snapshot', () => {
    let tempDir: string;
    let stateFile: string;
    const edited = { ...DEFAULT_SETTINGS, defaultPadding: ' ' };
    const snapshot: DevReloadSnapshot = {
        settings: edited,
        originalSettings: DEFAULT_SETTINGS,
        screen: 'items',
        selectedLine: 1,
        menuSelections: { main: 0, lines: 1 },
        itemsCursor: 3
    };

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-dev-reload-'));
        stateFile = path.join(tempDir, 'state.json');
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('round-trips unsaved settings and where the user was', () => {
        writeDevReloadSnapshot(stateFile, snapshot);

        expect(readDevReloadSnapshot(stateFile)).toEqual(snapshot);
    });

    it('returns to the main menu from screens a snapshot cannot rebuild', () => {
        writeDevReloadSnapshot(stateFile, { ...snapshot, screen: 'importPreview' });
        expect(readDevReloadSnapshot(stateFile)?.screen).toBe('main');

        writeDevReloadSnapshot(stateFile, { ...snapshot, screen: 'no-such-screen' });
        expect(readDevReloadSnapshot(stateFile)?.screen).toBe('main');
    });

    it('starts fresh when there is no snapshot, it is corrupt, or its settings no longer validate', () => {
        expect(readDevReloadSnapshot(stateFile)).toBeNull();

        fs.writeFileSync(stateFile, '{not json');
        expect(readDevReloadSnapshot(stateFile)).toBeNull();

        fs.writeFileSync(stateFile, 'null');
        expect(readDevReloadSnapshot(stateFile)).toBeNull();

        fs.writeFileSync(stateFile, JSON.stringify({ ...snapshot, settings: { lines: 'not lines' } }));
        expect(readDevReloadSnapshot(stateFile)).toBeNull();
    });
});
