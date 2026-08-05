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

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { clearCustomCommandCache } from '../../utils/custom-command';
import { CustomCommandWidget } from '../CustomCommand';

// Mock the process boundary: echo back whatever is handed to stdin, the way
// `cat` would. The widget output then IS the JSON it sent, so we can assert
// exactly what the custom command received, without spawning a subprocess.
vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockSpawnSync = spawnSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: (command: string, options: { stdio?: (string | number)[] }) => SpawnSyncReturns<string>) => void;
};

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const tempPaths: string[] = [];

function echoStdin(): void {
    mockSpawnSync.mockImplementation((_command, options) => {
        const stdin = options.stdio?.[0];
        const stdout = options.stdio?.[1];
        const payload = typeof stdin === 'number' ? fs.readFileSync(stdin, 'utf-8') : '';

        if (typeof stdout === 'number') {
            fs.writeSync(stdout, payload);
        }

        return {
            pid: 4242,
            output: [],
            stdout: payload,
            stderr: '',
            status: 0,
            signal: null
        };
    });
}

function useTempHome(): void {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-widget-home-'));
    tempPaths.push(home);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    vi.spyOn(os, 'homedir').mockReturnValue(home);
}

describe('CustomCommandWidget', () => {
    const widget = new CustomCommandWidget();

    const settings: Settings = {
        version: 3,
        lines: [],
        flexMode: 'full',
        compactThreshold: 60,
        colorLevel: 2,
        defaultPadding: ' ',
        defaultPaddingSide: 'both',
        inheritSeparatorColors: false,
        globalBold: false,
        gitCacheTtlSeconds: 5,
        customCommandCacheTtlSeconds: 0,
        minimalistMode: false,
        powerline: {
            enabled: false,
            separators: [],
            separatorInvertBackground: [],
            startCaps: [],
            endCaps: [],
            autoAlign: false,
            continueThemeAcrossLines: false
        }
    };

    const createItem = (): WidgetItem => ({
        id: 'test',
        type: 'custom-command',
        commandPath: 'echo'
    });

    // The TTL reaches the widget through the render context, the same route the
    // git cache TTL takes.
    const createContext = (
        terminalWidth: number | null | undefined,
        customCommandCacheTtlSeconds = 0
    ): RenderContext => ({
        data: { model: { display_name: 'Sonnet' } },
        terminalWidth,
        customCommandCacheTtlSeconds,
        isPreview: false
    });

    const renderParsed = (terminalWidth: number | null | undefined): Record<string, unknown> => {
        const output = widget.render(createItem(), createContext(terminalWidth), settings);
        if (output === null)
            throw new Error('expected command output');
        return JSON.parse(output) as Record<string, unknown>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        clearCustomCommandCache();
        echoStdin();
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

    it('includes terminal_width in the JSON piped to the command', () => {
        expect(renderParsed(142).terminal_width).toBe(142);
    });

    it('still passes through the existing data fields', () => {
        const model = renderParsed(142).model as { display_name?: string } | undefined;
        expect(model?.display_name).toBe('Sonnet');
    });

    it('omits terminal_width when the width is unknown', () => {
        expect(renderParsed(null)).not.toHaveProperty('terminal_width');
    });

    it('runs the command on every render when no cache TTL is configured', () => {
        renderParsed(142);
        renderParsed(142);

        expect(mockSpawnSync.mock.calls).toHaveLength(2);
    });

    it('reuses command output across renders within the configured TTL', () => {
        useTempHome();

        const first = widget.render(createItem(), createContext(142, 5), settings);
        const second = widget.render(createItem(), createContext(142, 5), settings);

        expect(second).toBe(first);
        expect(mockSpawnSync.mock.calls).toHaveLength(1);
    });

    it('runs the command again when the terminal width changes', () => {
        useTempHome();

        widget.render(createItem(), createContext(80, 5), settings);
        widget.render(createItem(), createContext(200, 5), settings);

        expect(mockSpawnSync.mock.calls).toHaveLength(2);
    });
});
