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

import {
    DEFAULT_SETTINGS,
    SettingsSchema
} from '../../../types/Settings';
import { waitFor } from '../../__tests__/helpers/wait-for-ink';
import {
    PowerlineSeparatorEditor,
    type PowerlineSeparatorEditorProps
} from '../PowerlineSeparatorEditor';
import {
    PowerlineSetup,
    buildPowerlineSetupMenuItems,
    getCapDisplay,
    getFontInstallMessageColor,
    getSeparatorDisplay,
    getThemeDisplay,
    type PowerlineSetupProps
} from '../PowerlineSetup';

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

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        getOutput() {
            return chunks.join('');
        }
    });
}

describe('PowerlineSetup helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('formats separator, cap, and theme display values', () => {
        const config = {
            ...DEFAULT_SETTINGS.powerline,
            enabled: true,
            separators: ['\uE0B4'],
            startCaps: ['\uE0B2'],
            endCaps: ['\uE0B0'],
            theme: 'gruvbox'
        };

        expect(getSeparatorDisplay(config)).toBe('\uE0B4 - Round Right');
        expect(getCapDisplay(config, 'start')).toBe('\uE0B2 - Triangle');
        expect(getCapDisplay(config, 'end')).toBe('\uE0B0 - Triangle');
        expect(getThemeDisplay(config)).toBe('Gruvbox');
    });

    // The Windows success message doesn't say "success"
    it('colors a font install message by whether the install worked', () => {
        expect(getFontInstallMessageColor({
            success: true,
            message: 'Installed 3 Powerline fonts. Please restart your terminal and select a Powerline font from your terminal settings.'
        })).toBe('green');
        expect(getFontInstallMessageColor({
            success: true,
            message: 'Powerline fonts installed successfully! Please restart your terminal and select a Powerline font'
        })).toBe('green');
        expect(getFontInstallMessageColor({
            success: false,
            message: 'Failed to install Powerline fonts: No fonts were installed. You can manually install fonts from: https://github.com/powerline/fonts'
        })).toBe('red');
    });

    it('builds powerline setup items with disabled states and sublabels', () => {
        const disabledItems = buildPowerlineSetupMenuItems({
            ...DEFAULT_SETTINGS.powerline,
            enabled: false
        });

        expect(disabledItems.every(item => item.disabled)).toBe(true);

        const enabledItems = buildPowerlineSetupMenuItems({
            ...DEFAULT_SETTINGS.powerline,
            enabled: true,
            separators: ['\uE0B0', '\uE0B4'],
            startCaps: [],
            endCaps: ['\uE0BC'],
            theme: undefined
        });

        expect(enabledItems[0]).toMatchObject({
            label: 'Separator  ',
            sublabel: '(multiple)',
            disabled: false
        });
        expect(enabledItems[1]).toMatchObject({
            label: 'Start Cap  ',
            sublabel: '(none)'
        });
        expect(enabledItems[2]).toMatchObject({
            label: 'End Cap    ',
            sublabel: '(\uE0BC - Diagonal)'
        });
        expect(enabledItems[3]).toMatchObject({
            label: 'Themes     ',
            sublabel: '(Custom)'
        });
    });

    it('toggles continue theme across lines when (c) is pressed', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineSetupProps['onUpdate']>();
        const onBack = vi.fn();
        const onInstallFonts = vi.fn();
        const onClearMessage = vi.fn();
        const instance = render(
            React.createElement(PowerlineSetup, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        continueThemeAcrossLines: false
                    }
                },
                powerlineFontStatus: { installed: true },
                onUpdate,
                onBack,
                onInstallFonts,
                installingFonts: false,
                fontInstallMessage: null,
                onClearMessage
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Continue Theme:');
            });

            stdin.write('c');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });

            const updatedSettings = onUpdate.mock.calls[0]?.[0];
            expect(updatedSettings).toBeDefined();
            expect(updatedSettings?.powerline.continueThemeAcrossLines).toBe(true);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('keeps a chosen Custom theme when (t) turns Powerline off and on again', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        // Each update is drawn again with the new settings, as the app does
        const onUpdate = vi.fn<PowerlineSetupProps['onUpdate']>((settings) => {
            instance.rerender(React.createElement(PowerlineSetup, { ...props, settings }));
        });
        const props: PowerlineSetupProps = {
            settings: {
                ...DEFAULT_SETTINGS,
                lines: [[{ id: '1', type: 'model', color: 'red', backgroundColor: 'bgYellow' }]],
                powerline: {
                    ...DEFAULT_SETTINGS.powerline,
                    enabled: true,
                    theme: 'custom'
                }
            },
            powerlineFontStatus: { installed: true },
            onUpdate,
            onBack: vi.fn(),
            onInstallFonts: vi.fn(),
            installingFonts: false,
            fontInstallMessage: null,
            onClearMessage: vi.fn()
        };
        const instance = render(
            React.createElement(PowerlineSetup, props),
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('✓ Enabled');
            });

            stdin.write('t');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('✗ Disabled');
            });

            stdin.write('t');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalledTimes(2);
            });

            const updatedSettings = onUpdate.mock.calls[1]?.[0];
            expect(updatedSettings?.powerline.enabled).toBe(true);
            expect(updatedSettings?.powerline.theme).toBe('custom');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it.each([
        ['unset', undefined, ''],
        ['none', '', ''],
        ['two spaces', '  ', '  ']
    ])('restores the default padding (%s) when (t) turns Powerline on and off again', async (_name, padding, restored) => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        // Each update is drawn again with the new settings, as the app does
        const onUpdate = vi.fn<PowerlineSetupProps['onUpdate']>((settings) => {
            instance.rerender(React.createElement(PowerlineSetup, { ...props, settings }));
        });
        const props: PowerlineSetupProps = {
            settings: {
                ...DEFAULT_SETTINGS,
                lines: [[{ id: '1', type: 'model' }, { id: '2', type: 'context-length' }]],
                defaultSeparator: '|',
                defaultPadding: padding
            },
            powerlineFontStatus: { installed: true },
            onUpdate,
            onBack: vi.fn(),
            onInstallFonts: vi.fn(),
            installingFonts: false,
            fontInstallMessage: null,
            onClearMessage: vi.fn()
        };
        const instance = render(
            React.createElement(PowerlineSetup, props),
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('✗ Disabled');
            });

            stdin.write('t');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('✓ Enabled');
            });
            expect(onUpdate.mock.calls[0]?.[0].defaultPadding).toBe(' ');

            stdin.write('t');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalledTimes(2);
            });

            const updatedSettings = onUpdate.mock.calls[1]?.[0];
            expect(updatedSettings?.powerline.enabled).toBe(false);
            expect(updatedSettings?.defaultPadding).toBe(restored);
            expect(updatedSettings?.powerline.paddingToRestore).toBeUndefined();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    // A padding set while Powerline was on is the user's own choice
    it('keeps a default padding changed since Powerline was turned on when (t) turns it off', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineSetupProps['onUpdate']>();
        const instance = render(
            React.createElement(PowerlineSetup, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    defaultPadding: '  ',
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        theme: 'nord-aurora',
                        paddingToRestore: ''
                    }
                },
                powerlineFontStatus: { installed: true },
                onUpdate,
                onBack: vi.fn(),
                onInstallFonts: vi.fn(),
                installingFonts: false,
                fontInstallMessage: null,
                onClearMessage: vi.fn()
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('✓ Enabled');
            });

            stdin.write('t');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });

            const updatedSettings = onUpdate.mock.calls[0]?.[0];
            expect(updatedSettings?.powerline.enabled).toBe(false);
            expect(updatedSettings?.defaultPadding).toBe('  ');
            expect(updatedSettings?.powerline.paddingToRestore).toBeUndefined();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    // Turning Powerline on with manual separators asks first; the separators,
    // a chosen Custom theme and the padding from before all come back with it off
    it('keeps manual separators, a Custom theme and the default padding when (t) turns Powerline on and off again', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        // Each update is drawn again with the new settings, as the app does
        const onUpdate = vi.fn<PowerlineSetupProps['onUpdate']>((settings) => {
            instance.rerender(React.createElement(PowerlineSetup, { ...props, settings }));
        });
        const props: PowerlineSetupProps = {
            settings: {
                ...DEFAULT_SETTINGS,
                lines: [[{ id: '1', type: 'model' }, { id: '2', type: 'separator' }, { id: '3', type: 'context-length' }]],
                defaultPadding: '  ',
                powerline: {
                    ...DEFAULT_SETTINGS.powerline,
                    enabled: false,
                    theme: 'custom'
                }
            },
            powerlineFontStatus: { installed: true },
            onUpdate,
            onBack: vi.fn(),
            onInstallFonts: vi.fn(),
            installingFonts: false,
            fontInstallMessage: null,
            onClearMessage: vi.fn()
        };
        const instance = render(
            React.createElement(PowerlineSetup, props),
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('✗ Disabled');
            });

            stdin.write('t');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Do you want to continue?');
            });

            stdin.write('\r');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('✓ Enabled');
            });
            const enabledSettings = onUpdate.mock.calls[0]?.[0];
            expect(enabledSettings?.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
            expect(enabledSettings?.powerline.theme).toBe('custom');

            stdin.write('t');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalledTimes(2);
            });

            const disabledSettings = onUpdate.mock.calls[1]?.[0];
            expect(disabledSettings?.powerline.enabled).toBe(false);
            expect(disabledSettings?.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
            expect(disabledSettings?.powerline.theme).toBe('custom');
            expect(disabledSettings?.defaultPadding).toBe('  ');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('shows the font install result it is given', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const instance = render(
            React.createElement(PowerlineSetup, {
                settings: DEFAULT_SETTINGS,
                powerlineFontStatus: { installed: true },
                onUpdate: vi.fn(),
                onBack: vi.fn(),
                onInstallFonts: vi.fn(),
                installingFonts: false,
                fontInstallMessage: {
                    success: true,
                    message: 'Installed 3 Powerline fonts. Please restart your terminal and select a Powerline font from your terminal settings.'
                },
                onClearMessage: vi.fn()
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Installed 3 Powerline fonts.');
                expect(stdout.getOutput()).toContain('Press any key to continue...');
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('warns when a global foreground override is active', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineSetupProps['onUpdate']>();
        const onBack = vi.fn();
        const onInstallFonts = vi.fn();
        const onClearMessage = vi.fn();
        const instance = render(
            React.createElement(PowerlineSetup, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    overrideForegroundColor: 'gradient:atlas',
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true
                    }
                },
                powerlineFontStatus: { installed: true },
                onUpdate,
                onBack,
                onInstallFonts,
                installingFonts: false,
                fontInstallMessage: null,
                onClearMessage
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Powerline Setup');
                expect(stdout.getOutput()).toContain('⚠ Global override for FG active');
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it('highlights Separator when (t) turns Powerline on without a confirm', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        // In debug mode Ink writes each frame whole, in one write. Every
        // frame here has a title with Powerline in it; bare cursor codes don't.
        let lastFrame = '';
        stdout.on('data', (chunk: Buffer | string) => {
            const text = chunk.toString();
            if (text.includes('Powerline')) {
                lastFrame = text;
            }
        });
        const onBack = vi.fn();
        // Keeps the settings (t) writes, so the menu redraws with Powerline on
        function StatefulPowerlineSetup() {
            const [settings, setSettings] = React.useState<PowerlineSetupProps['settings']>({
                ...DEFAULT_SETTINGS,
                // No manual separators, so (t) needs no confirm
                lines: [[{ id: '1', type: 'model' }]],
                powerline: {
                    ...DEFAULT_SETTINGS.powerline,
                    enabled: false
                }
            });

            return React.createElement(PowerlineSetup, {
                settings,
                powerlineFontStatus: { installed: true },
                onUpdate: setSettings,
                onBack,
                onInstallFonts: vi.fn(),
                installingFonts: false,
                fontInstallMessage: null,
                onClearMessage: vi.fn()
            });
        }
        const instance = render(
            React.createElement(StatefulPowerlineSetup),
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
            // Back is the only entry while Powerline is off
            await waitFor(() => {
                expect(lastFrame).toContain('▶  ← Back');
            });

            stdin.write('t');
            await waitFor(() => {
                expect(lastFrame).toContain('✓ Enabled');
                expect(lastFrame).toContain('▶  Separator');
            });
            expect(lastFrame).not.toContain('▶  ← Back');

            stdin.write('\r');
            await waitFor(() => {
                expect(lastFrame).toContain('Powerline Separator Configuration');
            });
            expect(onBack).not.toHaveBeenCalled();
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});

describe('PowerlineSeparatorEditor', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ['startCap', 'startCaps', '\uE0B2'],
        ['endCap', 'endCaps', '\uE0B0']
    ] as const)('allows adding more than 3 %s entries', async (mode, capKey, expectedDefaultCap) => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineSeparatorEditorProps['onUpdate']>();
        const onBack = vi.fn();
        const existingCaps = [expectedDefaultCap, expectedDefaultCap, expectedDefaultCap];
        const instance = render(
            React.createElement(PowerlineSeparatorEditor, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        [capKey]: existingCaps
                    }
                },
                mode,
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('(a)dd');
            });

            stdin.write('a');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });

            const updatedSettings = onUpdate.mock.calls[0]?.[0];
            expect(updatedSettings).toBeDefined();
            expect(updatedSettings?.powerline[capKey]).toHaveLength(4);
            expect(updatedSettings?.powerline[capKey][1]).toBe(expectedDefaultCap);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it.each([
        ['t', 't'],
        ['→', '\x1b[C']
    ])('keeps separator inversion saveable when %s edits a separator past a short inversion list', async (_key, input) => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineSeparatorEditorProps['onUpdate']>();
        const onBack = vi.fn();
        const instance = render(
            React.createElement(PowerlineSeparatorEditor, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        separators: ['\uE0B0', '\uE0B0', '\uE0B0'],
                        // The schema default, left as is when separators are added by hand
                        separatorInvertBackground: [false]
                    }
                },
                mode: 'separator',
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  1:');
            });

            stdin.write('\x1b[B');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  2:');
            });

            stdin.write('\x1b[B');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('▶  3:');
            });

            stdin.write(input);
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });

            const updatedSettings = onUpdate.mock.calls[0]?.[0];
            expect(updatedSettings?.powerline.separatorInvertBackground).toEqual([false, false, true]);
            // What ctrl+s writes must load back
            const saved: unknown = JSON.parse(JSON.stringify(updatedSettings));
            expect(SettingsSchema.safeParse(saved).success).toBe(true);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });

    it.each([
        ['Triangle Left gets inverted, as with ← →', 'E0B2', '\uE0B0', false, true],
        ['Round Left gets inverted, as with ← →', 'E0B6', '\uE0B0', false, true],
        ['Triangle Right over an inverted Triangle Left drops the inversion', 'E0B0', '\uE0B2', true, false],
        ['a custom code keeps the slot\'s inversion', 'E0C0', '\uE0B2', true, true]
    ])('entering a separator by hex code: %s', async (_name, hexCode, startChar, startInvert, expectedInvert) => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn<PowerlineSeparatorEditorProps['onUpdate']>();
        const onBack = vi.fn();
        const instance = render(
            React.createElement(PowerlineSeparatorEditor, {
                settings: {
                    ...DEFAULT_SETTINGS,
                    powerline: {
                        ...DEFAULT_SETTINGS.powerline,
                        enabled: true,
                        separators: [startChar],
                        separatorInvertBackground: [startInvert]
                    }
                },
                mode: 'separator',
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
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('(h)ex');
            });

            stdin.write('h');
            await waitFor(() => {
                expect(stdout.getOutput()).toContain('Enter hex code');
            });

            for (let typed = 1; typed <= hexCode.length; typed++) {
                stdin.write(hexCode.charAt(typed - 1));
                await waitFor(() => {
                    expect(stdout.getOutput()).toContain(`U+${hexCode.slice(0, typed)}`);
                });
            }

            stdin.write('\r');
            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalled();
            });

            const updatedSettings = onUpdate.mock.calls[0]?.[0];
            expect(updatedSettings?.powerline.separators).toEqual([String.fromCodePoint(Number.parseInt(hexCode, 16))]);
            expect(updatedSettings?.powerline.separatorInvertBackground).toEqual([expectedInvert]);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
