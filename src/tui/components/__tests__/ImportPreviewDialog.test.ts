import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import { getImportPreviewKeys } from '../ImportPreviewDialog';

describe('ImportPreviewDialog helpers', () => {
    it('includes optional settings that exist only in the imported config', () => {
        const current: Settings = { ...DEFAULT_SETTINGS };
        const imported: Settings = {
            ...DEFAULT_SETTINGS,
            defaultSeparator: ' | ',
            overrideForegroundColor: 'green'
        };

        expect('defaultSeparator' in current).toBe(false);
        expect('overrideForegroundColor' in current).toBe(false);
        expect(getImportPreviewKeys(current, imported)).toEqual(
            expect.arrayContaining(['defaultSeparator', 'overrideForegroundColor'])
        );
    });
});
