import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    Widget,
    WidgetItem
} from '../../types';
import { JjBookmarksWidget } from '../JjBookmarks';
import { JjChangesWidget } from '../JjChanges';
import { JjDeletionsWidget } from '../JjDeletions';
import { JjDescriptionWidget } from '../JjDescription';
import { JjInsertionsWidget } from '../JjInsertions';
import { JjRevisionWidget } from '../JjRevision';
import { JjRootDirWidget } from '../JjRootDir';
import { JjWorkspaceWidget } from '../JjWorkspace';
import { getEnabledHideStates } from '../shared/hideable';

const cases: { name: string; itemType: string; widget: Widget }[] = [
    { name: 'JjBookmarksWidget', itemType: 'jj-bookmarks', widget: new JjBookmarksWidget() },
    { name: 'JjWorkspaceWidget', itemType: 'jj-workspace', widget: new JjWorkspaceWidget() },
    { name: 'JjRootDirWidget', itemType: 'jj-root-dir', widget: new JjRootDirWidget() },
    { name: 'JjChangesWidget', itemType: 'jj-changes', widget: new JjChangesWidget() },
    { name: 'JjInsertionsWidget', itemType: 'jj-insertions', widget: new JjInsertionsWidget() },
    { name: 'JjDeletionsWidget', itemType: 'jj-deletions', widget: new JjDeletionsWidget() },
    { name: 'JjDescriptionWidget', itemType: 'jj-description', widget: new JjDescriptionWidget() },
    { name: 'JjRevisionWidget', itemType: 'jj-revision', widget: new JjRevisionWidget() }
];

describe('JJ widget shared behavior', () => {
    it.each(cases)('$name should declare the no-jj hideable state', ({ widget }) => {
        const states = widget.getHideableStates?.() ?? [];
        expect(states.map(state => state.key)).toContain('no-jj');
    });

    it.each(cases)('$name should not declare per-widget hide keybinds', ({ widget }) => {
        const keybinds = widget.getCustomKeybinds?.() ?? [];
        expect(keybinds.find(kb => kb.key === 'h')).toBeUndefined();
    });

    it.each(cases)('$name should enable no-jj via the unified hide metadata', ({ widget, itemType }) => {
        const item: WidgetItem = {
            id: itemType,
            type: itemType,
            metadata: { hide: 'no-jj' }
        };

        expect(getEnabledHideStates(item, widget.getHideableStates?.() ?? [])).toContain('no-jj');
    });
});
