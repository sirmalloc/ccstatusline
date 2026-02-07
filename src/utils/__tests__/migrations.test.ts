import {
    describe,
    expect,
    it
} from 'vitest';

import { CURRENT_VERSION } from '../../types/Settings';
import {
    detectVersion,
    migrateConfig,
    migrations,
    needsMigration
} from '../migrations';

describe('migrations', () => {
    describe('v3 to v4 migration', () => {
        const v3Config: Record<string, unknown> = {
            version: 3,
            lines: [
                [
                    { id: '1', type: 'model', color: 'cyan' },
                    { id: '2', type: 'separator' },
                    { id: '3', type: 'git-branch', color: 'magenta' }
                ]
            ],
            flexMode: 'full-minus-40',
            compactThreshold: 60,
            colorLevel: 2,
            globalBold: false,
            inheritSeparatorColors: false
        };

        it('should bump version to 4', () => {
            const result = migrateConfig(v3Config, 4) as Record<string, unknown>;
            expect(result.version).toBe(4);
        });

        it('should set update message about Nerd Font support', () => {
            const result = migrateConfig(v3Config, 4) as Record<string, unknown>;
            const updateMessage = result.updatemessage as { message: string; remaining: number };
            expect(updateMessage).toBeTruthy();
            expect(updateMessage.message).toContain('Nerd Font');
            expect(updateMessage.remaining).toBe(12);
        });

        it('should preserve all existing v3 fields', () => {
            const result = migrateConfig(v3Config, 4) as Record<string, unknown>;
            expect(result.lines).toEqual(v3Config.lines);
            expect(result.flexMode).toBe('full-minus-40');
            expect(result.compactThreshold).toBe(60);
            expect(result.colorLevel).toBe(2);
            expect(result.globalBold).toBe(false);
            expect(result.inheritSeparatorColors).toBe(false);
        });

        it('should not add nerdFontIcons field directly (Zod defaults handle it)', () => {
            const result = migrateConfig(v3Config, 4) as Record<string, unknown>;
            // The migration itself does not add nerdFontIcons.
            // Zod schema parsing applies the default (false) when the config is loaded.
            expect(result.nerdFontIcons).toBeUndefined();
        });

        it('should have a migration entry for v3 to v4', () => {
            const v3ToV4 = migrations.find(m => m.fromVersion === 3 && m.toVersion === 4);
            expect(v3ToV4).toBeTruthy();
            expect(v3ToV4?.description).toContain('Nerd Font');
        });
    });

    describe('detectVersion', () => {
        it('should detect v3 config', () => {
            expect(detectVersion({ version: 3 })).toBe(3);
        });

        it('should detect v4 config', () => {
            expect(detectVersion({ version: 4 })).toBe(4);
        });

        it('should default to v1 when no version field', () => {
            expect(detectVersion({ lines: [] })).toBe(1);
        });

        it('should default to v1 for non-object input', () => {
            expect(detectVersion(null)).toBe(1);
            expect(detectVersion('string')).toBe(1);
            expect(detectVersion(42)).toBe(1);
        });
    });

    describe('needsMigration', () => {
        it('should return true for v3 config targeting v4', () => {
            expect(needsMigration({ version: 3 }, 4)).toBe(true);
        });

        it('should return false for v4 config targeting v4', () => {
            expect(needsMigration({ version: 4 }, 4)).toBe(false);
        });

        it('should return true for v1 config targeting current version', () => {
            expect(needsMigration({ lines: [] }, CURRENT_VERSION)).toBe(true);
        });
    });

    describe('full migration chain to v4', () => {
        it('should migrate v1 config all the way to v4', () => {
            const v1Config = {
                lines: [
                    [{ type: 'model', color: 'cyan' }]
                ],
                flexMode: 'full-minus-40'
            };

            const result = migrateConfig(v1Config, 4) as Record<string, unknown>;
            expect(result.version).toBe(4);
        });

        it('should migrate v2 config to v4', () => {
            const v2Config = {
                version: 2,
                lines: [
                    [{ id: '1', type: 'model', color: 'cyan' }]
                ]
            };

            const result = migrateConfig(v2Config, 4) as Record<string, unknown>;
            expect(result.version).toBe(4);
        });
    });

    describe('CURRENT_VERSION consistency', () => {
        it('should be 4', () => {
            expect(CURRENT_VERSION).toBe(4);
        });

        it('should match the highest migration toVersion', () => {
            const highestToVersion = Math.max(...migrations.map(m => m.toVersion));
            expect(CURRENT_VERSION).toBe(highestToVersion);
        });
    });
});