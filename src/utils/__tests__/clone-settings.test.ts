import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import { cloneSettings } from '../clone-settings';

describe('cloneSettings', () => {
    it('creates a deep clone that is independent from source', () => {
        const original = {
            ...DEFAULT_SETTINGS,
            lines: [
                [
                    { id: '1', type: 'model', metadata: { key: 'value' } }
                ]
            ]
        };

        const cloned = cloneSettings(original);
        const originalWidget = original.lines[0]?.[0];
        const clonedWidget = cloned.lines[0]?.[0];

        expect(originalWidget).toBeDefined();
        expect(clonedWidget).toBeDefined();

        if (!originalWidget || !clonedWidget) {
            throw new Error('Expected cloned settings to include widget entries');
        }

        const originalMetadata = originalWidget.metadata as Record<string, string>;
        const clonedMetadata = (clonedWidget.metadata ?? {});
        clonedWidget.metadata = clonedMetadata;
        clonedMetadata.key = 'changed';

        expect(originalMetadata.key).toBe('value');
        expect(clonedMetadata.key).toBe('changed');
    });
});