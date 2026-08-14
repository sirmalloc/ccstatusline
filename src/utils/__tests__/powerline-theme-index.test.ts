import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    advanceGlobalPowerlineThemeIndex,
    assignPowerlineThemeSlots,
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

    it('treats separators as powerline theme merge boundaries', () => {
        const entries: PowerlineThemeSlotEntry[] = [
            entry({ id: '1', type: 'model', merge: true }),
            entry({ id: '2', type: 'flex-separator' }),
            entry({ id: '3', type: 'context-length', merge: true }),
            entry({ id: '4', type: 'separator' }),
            entry({ id: '5', type: 'git-branch' })
        ];

        expect(countPowerlineThemeSlots(entries)).toBe(3);
    });

    it('assigns merged widgets the same slot and skips unrendered entries', () => {
        const entries: PowerlineThemeSlotEntry[] = [
            entry({ id: '1', type: 'model', merge: true }),
            entry({ id: '2', type: 'context-length' }),
            entry({ id: '3', type: 'separator' }),
            entry({ id: '4', type: 'git-branch' }, ''),
            entry({ id: '5', type: 'git-changes' })
        ];

        expect(assignPowerlineThemeSlots(entries)).toEqual([0, 0, -1, -1, 1]);
    });

    it('starts assignment from a carried-over index', () => {
        const entries: PowerlineThemeSlotEntry[] = [
            entry({ id: '1', type: 'model' }),
            entry({ id: '2', type: 'git-branch' })
        ];

        expect(assignPowerlineThemeSlots(entries, 3)).toEqual([3, 4]);
    });

    it('breaks a merge run at a separator', () => {
        const entries: PowerlineThemeSlotEntry[] = [
            entry({ id: '1', type: 'model', merge: true }),
            entry({ id: '2', type: 'flex-separator' }),
            entry({ id: '3', type: 'context-length' })
        ];

        expect(assignPowerlineThemeSlots(entries)).toEqual([0, -1, 1]);
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
