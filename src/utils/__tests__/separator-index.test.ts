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

function preRendered(
    widgets: WidgetItem[],
    contentByIndex: Record<number, string>
) {
    return widgets.map((widget, index) => ({
        content: contentByIndex[index] ?? 'x',
        widget
    }));
}

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

    it('does not count flex separators as separator slots', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: 'flex', type: 'flex-separator' },
            { id: '2', type: 'context-length' }
        ];

        expect(countSeparatorSlots(widgets)).toBe(0);
    });

    it('counts separator slots independently within flex-delimited segments', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'context-length' },
            { id: 'flex', type: 'flex-separator' },
            { id: '3', type: 'version' },
            { id: '4', type: 'session-cost' }
        ];

        expect(countSeparatorSlots(widgets)).toBe(2);
    });

    it('ignores explicit separator widgets for powerline separator indexing', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: 'separator', type: 'separator' },
            { id: '2', type: 'context-length' }
        ];

        expect(countSeparatorSlots(widgets)).toBe(1);
    });

    it('counts only widgets that rendered content when pre-render data is available', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: 'hidden', type: 'custom-text' },
            { id: '2', type: 'context-length' }
        ];

        expect(countSeparatorSlots(widgets, preRendered(widgets, {
            0: 'model',
            1: '',
            2: 'context'
        }))).toBe(1);
    });

    it('honors merge state on the previous rendered widget across hidden widgets', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model', merge: true },
            { id: 'hidden', type: 'custom-text' },
            { id: '2', type: 'context-length' }
        ];

        expect(countSeparatorSlots(widgets, preRendered(widgets, {
            0: 'model',
            1: '',
            2: 'context'
        }))).toBe(0);
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

    it('advances a running global separator index from rendered separator slots', () => {
        const line: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: 'hidden', type: 'custom-text' },
            { id: '2', type: 'context-length' }
        ];

        expect(advanceGlobalSeparatorIndex(3, line, preRendered(line, {
            0: 'model',
            1: '',
            2: 'context'
        }))).toBe(4);
    });
});
