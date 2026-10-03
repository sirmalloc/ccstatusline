import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
    readDevReloadSnapshot,
    runDevReloadSupervisor,
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

        fs.writeFileSync(stateFile, JSON.stringify({ ...snapshot, settings: { lines: 'not lines' } }));
        expect(readDevReloadSnapshot(stateFile)).toBeNull();
    });
});
