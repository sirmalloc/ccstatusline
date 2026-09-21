import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    arePerLineColorsThemeManaged,
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

        const updated = buildEnabledPowerlineSettings(settings, false);

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

        const updated = buildEnabledPowerlineSettings(settings, false);
        expect(updated.powerline.theme).toBe('catppuccin');
    });

    it('removes manual separators while preserving flex separators when requested', () => {
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

        const updated = buildEnabledPowerlineSettings(settings, true);
        expect(updated.lines[0]?.map(item => item.type)).toEqual(['model', 'context-length', 'flex-separator']);
    });

    it('keeps manual separators when removal is not requested', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'context-length' }
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            lines: [line]
        };

        const updated = buildEnabledPowerlineSettings(settings, false);
        expect(updated.lines[0]?.map(item => item.type)).toEqual(['model', 'separator', 'context-length']);
    });
});

function withPowerline(enabled: boolean, theme: string | undefined) {
    return {
        ...DEFAULT_SETTINGS,
        powerline: { ...DEFAULT_SETTINGS.powerline, enabled, theme }
    };
}

describe('arePerLineColorsThemeManaged', () => {
    it('is true when powerline is enabled with a preset theme', () => {
        expect(arePerLineColorsThemeManaged(withPowerline(true, 'nord'))).toBe(true);
    });

    it('is false for the custom theme', () => {
        expect(arePerLineColorsThemeManaged(withPowerline(true, 'custom'))).toBe(false);
    });

    it('is false when the theme is undefined (the default)', () => {
        expect(arePerLineColorsThemeManaged(withPowerline(true, undefined))).toBe(false);
    });

    it('is false when powerline is disabled', () => {
        expect(arePerLineColorsThemeManaged(withPowerline(false, 'nord'))).toBe(false);
    });
});
