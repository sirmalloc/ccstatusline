import type { SpawnSyncReturns } from 'node:child_process';
import { spawnSync } from 'node:child_process';
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
import {
    getVisibleText,
    getVisibleWidth
} from '../../utils/ansi';
import type { CustomCommandRequest } from '../../utils/custom-command';
import { clearCustomCommandCache } from '../../utils/custom-command';
import { CustomCommandWidget } from '../CustomCommand';

// Mock the process boundary: echo back whatever is handed to stdin, the way
// `cat` would. The widget output then IS the JSON it sent, so we can assert
// exactly what the custom command received, without spawning a subprocess.
vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockSpawnSync = spawnSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: (command: string, args: string[], options: { input?: string }) => SpawnSyncReturns<string>) => void;
};

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const tempPaths: string[] = [];

function echoStdin(): void {
    mockSpawnSync.mockImplementation((_command, _args, options) => {
        const request = JSON.parse(options.input ?? '{}') as CustomCommandRequest;

        return {
            pid: 4242,
            output: [],
            stdout: JSON.stringify({ status: 'ok', stdout: request.input }),
            stderr: '',
            status: 0,
            signal: null
        };
    });
}

function respondWith(stdout: string): void {
    mockSpawnSync.mockImplementation(() => ({
        pid: 4242,
        output: [],
        stdout: JSON.stringify({ status: 'ok', stdout }),
        stderr: '',
        status: 0,
        signal: null
    }));
}

function hasLoneSurrogate(text: string): boolean {
    return Array.from(text).some(char => /^[\uD800-\uDFFF]$/.test(char));
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
        terminalWidthCacheTtlSeconds: 5,
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
    describe('maxWidth truncation', () => {
        const SGR_ORANGE = '\x1b[38;5;208m';
        const SGR_RESET = '\x1b[0m';

        const renderWith = (stdout: string, item: Partial<WidgetItem>): string | null => {
            respondWith(stdout);
            return widget.render({ ...createItem(), ...item }, createContext(200), settings);
        };

        it('truncates coloured preserveColors output by visible width and closes the colour', () => {
            const output = renderWith(`${SGR_ORANGE}feature/login-refactor${SGR_RESET}`, { preserveColors: true, maxWidth: 20 }) ?? '';

            expect(getVisibleText(output)).toBe('feature/login-ref...');
            expect(getVisibleWidth(output)).toBe(20);
            expect(output.startsWith(SGR_ORANGE)).toBe(true);
            expect(output.endsWith(SGR_RESET)).toBe(true);
        });

        it('closes an 8-bit colour the truncation cut off', () => {
            const output = renderWith('\x9b38;5;208mfeature/login-refactor\x9b0m', { preserveColors: true, maxWidth: 20 }) ?? '';

            expect(getVisibleText(output)).toBe('feature/login-ref...');
            expect(output.endsWith(SGR_RESET)).toBe(true);
        });

        it('never cuts preserveColors output in the middle of an escape sequence', () => {
            const output = renderWith(`${SGR_ORANGE}feature/login-refactor${SGR_RESET}`, { preserveColors: true, maxWidth: 10 }) ?? '';

            expect(getVisibleText(output)).toBe('feature...');
            expect(output.startsWith(SGR_ORANGE)).toBe(true);
        });

        it('leaves coloured output that fits alone', () => {
            const stdout = `${SGR_ORANGE}main${SGR_RESET}`;

            expect(renderWith(stdout, { preserveColors: true, maxWidth: 20 })).toBe(stdout);
        });

        it('truncates wide characters by display columns', () => {
            const output = renderWith('中'.repeat(20), { maxWidth: 20 }) ?? '';

            expect(getVisibleWidth(output)).toBeLessThanOrEqual(20);
            expect(output).toBe(`${'中'.repeat(8)}...`);
        });

        it('never splits a surrogate pair', () => {
            const output = renderWith('😀'.repeat(15), { maxWidth: 20 }) ?? '';

            expect(hasLoneSurrogate(output)).toBe(false);
            expect(getVisibleWidth(output)).toBeLessThanOrEqual(20);
            expect(output).toBe(`${'😀'.repeat(8)}...`);
        });

        it('still truncates plain output with an ellipsis', () => {
            expect(renderWith('feature/login-refactor', { maxWidth: 20 })).toBe('feature/login-ref...');
        });
    });
});
