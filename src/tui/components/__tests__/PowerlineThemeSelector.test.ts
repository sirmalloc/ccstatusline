import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import { getPowerlineThemes } from '../../../utils/colors';
import {
    PowerlineThemeSelector,
    applyCustomPowerlineTheme,
    buildPowerlineThemeItems,
    type PowerlineThemeSelectorProps
} from '../PowerlineThemeSelector';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): NodeJS.WriteStream {
    return new MockTtyStream() as unknown as NodeJS.WriteStream;
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

describe('PowerlineThemeSelector helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('builds powerline theme list items with original theme sublabels', () => {
        const items = buildPowerlineThemeItems(['gruvbox', 'onedark'], 'onedark');

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            label: 'Gruvbox',
            value: 'gruvbox'
        });
        expect(items[1]).toMatchObject({
            label: 'One Dark',
            sublabel: '(original)',
            value: 'onedark'
        });
    });

    it('copies a built-in theme into widget colors and switches to custom mode', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 2 as const,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                theme: 'gruvbox'
            }
        };

        const updatedSettings = applyCustomPowerlineTheme(settings, 'gruvbox');

        expect(updatedSettings).not.toBeNull();
        expect(updatedSettings?.powerline.theme).toBe('custom');
        expect(updatedSettings?.lines[0]?.[0]).toMatchObject({
            color: 'ansi256:16',
            backgroundColor: 'ansi256:167'
        });
        expect(updatedSettings?.lines[0]?.[1]).toEqual(settings.lines[0]?.[1]);
        expect(updatedSettings?.lines[0]?.[2]).toMatchObject({
            color: 'ansi256:235',
            backgroundColor: 'ansi256:214'
        });
    });

    it('returns null when the requested theme cannot be customized', () => {
        expect(applyCustomPowerlineTheme(DEFAULT_SETTINGS, 'custom')).toBeNull();
        expect(applyCustomPowerlineTheme(DEFAULT_SETTINGS, 'missing-theme')).toBeNull();
    });

    it('previews the highlighted theme once without triggering update-depth warnings', async () => {
        const themes = getPowerlineThemes();

        expect(themes.length).toBeGreaterThan(1);

        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineThemeSelectorProps['onUpdate']>();
        const onBack = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const instance = render(
            React.createElement(PowerlineThemeSelector, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        theme: themes[0]
                    }
                },
                onUpdate,
                onBack
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await flushInk();
            expect(onUpdate).not.toHaveBeenCalled();

            stdin.write('\u001B[B');
            await flushInk();

            expect(onUpdate).toHaveBeenCalledTimes(1);
            expect(onUpdate.mock.calls[0]?.[0]?.powerline.theme).toBe(themes[1]);

            const maximumUpdateDepthWarnings = consoleErrorSpy.mock.calls.filter((call) => {
                return call.some(arg => typeof arg === 'string' && arg.includes('Maximum update depth exceeded'));
            });

            expect(maximumUpdateDepthWarnings).toHaveLength(0);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});