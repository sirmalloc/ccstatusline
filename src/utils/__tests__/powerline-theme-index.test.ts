import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    advanceGlobalPowerlineThemeIndex,
    countPowerlineThemeSlots,
    type PowerlineThemeSlotEntry
} from '../powerline-theme-index';

function entry(widget: WidgetItem, content = 'x'): PowerlineThemeSlotEntry {
    return { widget, content };
}

describe('powerline theme index utils', () => {
    it('counts visible powerline color groups across merged widgets', () => {
        const entries: PowerlineThemeSlotEntry[] = [
            entry({ id: '1', type: 'model', merge: true }),
            entry({ id: '2', type: 'context-length' }),
            entry({ id: '3', type: 'git-branch' }),
            entry({ id: '4', type: 'git-changes', merge: 'no-padding' }),
            entry({ id: '5', type: 'session-cost' })
        ];

        expect(countPowerlineThemeSlots(entries)).toBe(3);
    });

    it('skips separators and widgets that rendered no content', () => {
        const entries: PowerlineThemeSlotEntry[] = [
            entry({ id: '1', type: 'model', merge: true }, ''),
            entry({ id: '2', type: 'separator' }),
            entry({ id: '3', type: 'context-length' }, ''),
            entry({ id: '4', type: 'git-branch' }),
            entry({ id: '5', type: 'flex-separator' }),
            entry({ id: '6', type: 'git-changes' })
        ];

        expect(countPowerlineThemeSlots(entries)).toBe(2);
    });

    it('advances a running global theme index', () => {
        const firstLine: PowerlineThemeSlotEntry[] = [
            entry({ id: '1', type: 'model' }),
            entry({ id: '2', type: 'context-length' })
        ];
        const secondLine: PowerlineThemeSlotEntry[] = [
            entry({ id: '3', type: 'git-branch', merge: true }),
            entry({ id: '4', type: 'git-changes' }),
            entry({ id: '5', type: 'session-cost' })
        ];

        const afterFirst = advanceGlobalPowerlineThemeIndex(0, firstLine);
        const afterSecond = advanceGlobalPowerlineThemeIndex(afterFirst, secondLine);

        expect(afterFirst).toBe(2);
        expect(afterSecond).toBe(4);
    });
});
