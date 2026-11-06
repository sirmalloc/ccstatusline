import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    buildDisabledPowerlineSettings,
    buildEnabledPowerlineSettings
} from '../powerline-settings';

describe('powerline settings helpers', () => {
    it('enables powerline with default theme and default padding', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: undefined
            }
        };

        const updated = buildEnabledPowerlineSettings(settings);

        expect(updated.powerline.enabled).toBe(true);
        expect(updated.powerline.theme).toBe('nord-aurora');
        expect(updated.defaultPadding).toBe(' ');
    });

    it('preserves non-custom theme when enabling powerline', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: 'catppuccin'
            }
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.powerline.theme).toBe('catppuccin');
    });

    it('keeps a custom theme when enabling powerline again', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: 'custom'
            }
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.powerline.theme).toBe('custom');
    });

    it.each([
        ['unset', undefined, ''],
        ['none', '', ''],
        ['two spaces', '  ', '  ']
    ])('remembers the default padding it replaces (%s) when enabling powerline', (_name, padding, remembered) => {
        const settings = {
            ...DEFAULT_SETTINGS,
            defaultPadding: padding
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.defaultPadding).toBe(' ');
        expect(updated.powerline.paddingToRestore).toBe(remembered);
    });

    it('keeps manual separators alongside flex separators when enabling', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'context-length' },
            { id: '4', type: 'flex-separator' }
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            lines: [line]
        };

        const updated = buildEnabledPowerlineSettings(settings);
        expect(updated.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length', 'flex-separator']);
    });

    it('does not delete a manual separator across an enable then disable round trip', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'context-length' }
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false
            },
            lines: [line]
        };

        const enabled = buildEnabledPowerlineSettings(settings);
        const disabled = {
            ...enabled,
            powerline: {
                ...enabled.powerline,
                enabled: false
            }
        };

        expect(disabled.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
    });

    it('keeps manual separators, a Custom theme and the default padding when turned on, off and on again', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'context-length' }
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            defaultPadding: '  ',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: false,
                theme: 'custom'
            },
            lines: [line]
        };

        const enabled = buildEnabledPowerlineSettings(settings);
        const disabled = buildDisabledPowerlineSettings(enabled);
        const enabledAgain = buildEnabledPowerlineSettings(disabled);

        expect(disabled.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
        expect(disabled.defaultPadding).toBe('  ');
        expect(disabled.powerline.theme).toBe('custom');
        expect(enabledAgain.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
        expect(enabledAgain.powerline.theme).toBe('custom');
    });
});
