import {
    describe,
    expect,
    it
} from 'vitest';

import {
    CURRENT_VERSION,
    DEFAULT_SETTINGS,
    SettingsSchema
} from '../../types/Settings';

describe('Settings schema', () => {
    describe('DEFAULT_SETTINGS', () => {
        it('should have nerdFontIcons set to false', () => {
            expect(DEFAULT_SETTINGS.nerdFontIcons).toBe(false);
        });

        it('should have version set to CURRENT_VERSION', () => {
            expect(DEFAULT_SETTINGS.version).toBe(CURRENT_VERSION);
        });

        it('should have version 4', () => {
            expect(DEFAULT_SETTINGS.version).toBe(4);
        });

        it('should have globalBold set to false', () => {
            expect(DEFAULT_SETTINGS.globalBold).toBe(false);
        });

        it('should have inheritSeparatorColors set to false', () => {
            expect(DEFAULT_SETTINGS.inheritSeparatorColors).toBe(false);
        });

        it('should have powerline disabled by default', () => {
            expect(DEFAULT_SETTINGS.powerline.enabled).toBe(false);
        });
    });

    describe('SettingsSchema parsing', () => {
        it('should default nerdFontIcons to false when not provided', () => {
            const parsed = SettingsSchema.parse({});
            expect(parsed.nerdFontIcons).toBe(false);
        });

        it('should accept nerdFontIcons: true', () => {
            const parsed = SettingsSchema.parse({ nerdFontIcons: true });
            expect(parsed.nerdFontIcons).toBe(true);
        });

        it('should default version to CURRENT_VERSION when not provided', () => {
            const parsed = SettingsSchema.parse({});
            expect(parsed.version).toBe(CURRENT_VERSION);
        });

        it('should apply Zod defaults to a migrated v3 config missing nerdFontIcons', () => {
            // Simulates what happens after migration: config has version 4 but no nerdFontIcons field
            const migratedConfig = {
                version: 4,
                lines: [
                    [
                        { id: '1', type: 'model', color: 'cyan' }
                    ]
                ]
            };

            const parsed = SettingsSchema.parse(migratedConfig);
            expect(parsed.nerdFontIcons).toBe(false);
            expect(parsed.version).toBe(4);
        });
    });
});