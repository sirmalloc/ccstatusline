import {
    describe,
    expect,
    it
} from 'vitest';

import {
    migrateConfig,
    migrations
} from '../migrations';

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
        expect(result.nerdFontIcons).toBeUndefined();
    });

    it('should have a migration entry for v3 to v4', () => {
        const v3ToV4 = migrations.find(m => m.fromVersion === 3 && m.toVersion === 4);
        expect(v3ToV4).toBeTruthy();
        expect(v3ToV4?.description).toContain('Nerd Font');
    });
});
