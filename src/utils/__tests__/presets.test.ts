import {
    describe,
    expect,
    it
} from 'vitest';

import { SettingsSchema } from '../../types/Settings';
import {
    PRESETS,
    buildPresetSettings
} from '../presets';
import { isKnownWidgetType } from '../widgets';

describe('presets', () => {
    it('has unique preset names', () => {
        const names = PRESETS.map(preset => preset.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('only uses known widget types with unique ids per preset', () => {
        for (const preset of PRESETS) {
            const ids = preset.lines.flat().map(item => item.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const item of preset.lines.flat()) {
                expect(isKnownWidgetType(item.type), `${preset.name}: ${item.type}`).toBe(true);
            }
        }
    });

    it('parses each preset into a valid full Settings object', () => {
        for (const preset of PRESETS) {
            const settings = buildPresetSettings(preset);
            const parsed = SettingsSchema.safeParse(settings);
            expect(parsed.success, preset.name).toBe(true);
            expect(settings.lines.length).toBeGreaterThanOrEqual(1);
        }
        expect(PRESETS.find(preset => preset.name === 'starter')?.lines).toHaveLength(1);
    });
});
