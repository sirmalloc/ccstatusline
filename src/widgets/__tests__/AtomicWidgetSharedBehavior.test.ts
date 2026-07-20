import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    CustomKeybind,
    Widget,
    WidgetItem
} from '../../types';
import { AtomicChangeWidget } from '../AtomicChange';
import { AtomicChangesWidget } from '../AtomicChanges';
import { AtomicDeletionsWidget } from '../AtomicDeletions';
import { AtomicDescriptionWidget } from '../AtomicDescription';
import { AtomicInsertionsWidget } from '../AtomicInsertions';
import { AtomicRootDirWidget } from '../AtomicRootDir';
import { AtomicViewWidget } from '../AtomicView';

type AtomicWidget = Widget & {
    getCustomKeybinds: () => CustomKeybind[];
    handleEditorAction: (action: string, item: WidgetItem) => WidgetItem | null;
};

const cases: { name: string; itemType: string; widget: AtomicWidget }[] = [
    { name: 'AtomicViewWidget', itemType: 'atomic-view', widget: new AtomicViewWidget() },
    { name: 'AtomicRootDirWidget', itemType: 'atomic-root-dir', widget: new AtomicRootDirWidget() },
    { name: 'AtomicChangesWidget', itemType: 'atomic-changes', widget: new AtomicChangesWidget() },
    { name: 'AtomicInsertionsWidget', itemType: 'atomic-insertions', widget: new AtomicInsertionsWidget() },
    { name: 'AtomicDeletionsWidget', itemType: 'atomic-deletions', widget: new AtomicDeletionsWidget() },
    { name: 'AtomicDescriptionWidget', itemType: 'atomic-description', widget: new AtomicDescriptionWidget() },
    { name: 'AtomicChangeWidget', itemType: 'atomic-change', widget: new AtomicChangeWidget() }
];

describe('Atomic widget shared behavior', () => {
    it.each(cases)('$name should expose hide-no-atomic keybind', ({ widget }) => {
        expect(widget.getCustomKeybinds()).toContainEqual(
            { key: 'h', label: '(h)ide \'no atomic\' message', action: 'toggle-noatomic' }
        );
    });

    it.each(cases)('$name should toggle hideNoAtomic metadata', ({ widget, itemType }) => {
        const base: WidgetItem = { id: itemType, type: itemType };
        const toggledOn = widget.handleEditorAction('toggle-noatomic', base);
        const toggledOff = widget.handleEditorAction('toggle-noatomic', toggledOn ?? base);

        expect(toggledOn?.metadata?.hideNoAtomic).toBe('true');
        expect(toggledOff?.metadata?.hideNoAtomic).toBe('false');
    });

    it.each(cases)('$name should show hide-no-atomic modifier in editor display', ({ widget, itemType }) => {
        const display = widget.getEditorDisplay({
            id: itemType,
            type: itemType,
            metadata: { hideNoAtomic: 'true' }
        });

        expect(display.modifierText).toBe('(hide \'no atomic\')');
    });
});
