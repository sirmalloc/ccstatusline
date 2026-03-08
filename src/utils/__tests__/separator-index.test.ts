import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    advanceGlobalSeparatorIndex,
    countSeparatorSlots
} from '../separator-index';

describe('separator index utils', () => {
    it('returns zero for empty and single-item lines', () => {
        expect(countSeparatorSlots([])).toBe(0);

        const single: WidgetItem[] = [{ id: '1', type: 'model' }];
        expect(countSeparatorSlots(single)).toBe(0);
    });

    it('counts one separator slot between two non-merged items', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'context-length' }
        ];

        expect(countSeparatorSlots(widgets)).toBe(1);
    });

    it('does not count separator slots for merged items', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model', merge: true },
            { id: '2', type: 'context-length' },
            { id: '3', type: 'version' }
        ];

        expect(countSeparatorSlots(widgets)).toBe(1);
    });

    it('treats no-padding merge the same as merged', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model', merge: 'no-padding' },
            { id: '2', type: 'context-length' },
            { id: '3', type: 'version' }
        ];

        expect(countSeparatorSlots(widgets)).toBe(1);
    });

    it('advances a running global separator index', () => {
        const firstLine: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'context-length' },
            { id: '3', type: 'version' }
        ];
        const secondLine: WidgetItem[] = [
            { id: '4', type: 'git-branch', merge: true },
            { id: '5', type: 'git-changes' },
            { id: '6', type: 'session-cost' }
        ];

        const afterFirst = advanceGlobalSeparatorIndex(0, firstLine);
        const afterSecond = advanceGlobalSeparatorIndex(afterFirst, secondLine);

        expect(afterFirst).toBe(2);
        expect(afterSecond).toBe(3);
    });
});