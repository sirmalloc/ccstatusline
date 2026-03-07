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
import { JjBookmarkWidget } from '../JjBookmark';
import { JjChangeWidget } from '../JjChange';
import { JjChangesWidget } from '../JjChanges';
import { JjDeletionsWidget } from '../JjDeletions';
import { JjDescriptionWidget } from '../JjDescription';
import { JjInsertionsWidget } from '../JjInsertions';
import { JjRootDirWidget } from '../JjRootDir';
import { JjWorkspaceWidget } from '../JjWorkspace';

type JjWidget = Widget & {
    getCustomKeybinds: () => CustomKeybind[];
    handleEditorAction: (action: string, item: WidgetItem) => WidgetItem | null;
    getCategory: () => string;
};

const cases: { name: string; itemType: string; widget: JjWidget }[] = [
    { name: 'JjChangeWidget', itemType: 'jj-change', widget: new JjChangeWidget() },
    { name: 'JjBookmarkWidget', itemType: 'jj-bookmark', widget: new JjBookmarkWidget() },
    { name: 'JjChangesWidget', itemType: 'jj-changes', widget: new JjChangesWidget() },
    { name: 'JjInsertionsWidget', itemType: 'jj-insertions', widget: new JjInsertionsWidget() },
    { name: 'JjDeletionsWidget', itemType: 'jj-deletions', widget: new JjDeletionsWidget() },
    { name: 'JjRootDirWidget', itemType: 'jj-root-dir', widget: new JjRootDirWidget() },
    { name: 'JjDescriptionWidget', itemType: 'jj-description', widget: new JjDescriptionWidget() },
    { name: 'JjWorkspaceWidget', itemType: 'jj-workspace', widget: new JjWorkspaceWidget() }
];

describe('Jj widget shared behavior', () => {
    it.each(cases)('$name should expose hide-no-jj keybind', ({ widget }) => {
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'h', label: '(h)ide \'no jj\' message', action: 'toggle-nojj' }
        ]);
    });

    it.each(cases)('$name should toggle hideNoJj metadata', ({ widget, itemType }) => {
        const base: WidgetItem = { id: itemType, type: itemType };
        const toggledOn = widget.handleEditorAction('toggle-nojj', base);
        const toggledOff = widget.handleEditorAction('toggle-nojj', toggledOn ?? base);

        expect(toggledOn?.metadata?.hideNoJj).toBe('true');
        expect(toggledOff?.metadata?.hideNoJj).toBe('false');
    });

    it.each(cases)('$name should show hide-no-jj modifier in editor display', ({ widget, itemType }) => {
        const display = widget.getEditorDisplay({
            id: itemType,
            type: itemType,
            metadata: { hideNoJj: 'true' }
        });

        expect(display.modifierText).toBe('(hide \'no jj\')');
    });

    it.each(cases)('$name should have category Jujutsu', ({ widget }) => {
        expect(widget.getCategory()).toBe('Jujutsu');
    });
});