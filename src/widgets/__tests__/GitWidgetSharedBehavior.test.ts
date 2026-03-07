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
import { GitBranchWidget } from '../GitBranch';
import { GitChangesWidget } from '../GitChanges';
import { GitDeletionsWidget } from '../GitDeletions';
import { GitInsertionsWidget } from '../GitInsertions';
import { GitRootDirWidget } from '../GitRootDir';
import { GitWorktreeWidget } from '../GitWorktree';

type GitWidget = Widget & {
    getCustomKeybinds: () => CustomKeybind[];
    handleEditorAction: (action: string, item: WidgetItem) => WidgetItem | null;
};

const cases: { name: string; itemType: string; widget: GitWidget }[] = [
    { name: 'GitBranchWidget', itemType: 'git-branch', widget: new GitBranchWidget() },
    { name: 'GitChangesWidget', itemType: 'git-changes', widget: new GitChangesWidget() },
    { name: 'GitInsertionsWidget', itemType: 'git-insertions', widget: new GitInsertionsWidget() },
    { name: 'GitDeletionsWidget', itemType: 'git-deletions', widget: new GitDeletionsWidget() },
    { name: 'GitRootDirWidget', itemType: 'git-root-dir', widget: new GitRootDirWidget() },
    { name: 'GitWorktreeWidget', itemType: 'git-worktree', widget: new GitWorktreeWidget() }
];

describe('Git widget shared behavior', () => {
    it.each(cases)('$name should expose hide-no-git and hide-when-jj keybinds', ({ widget }) => {
        expect(widget.getCustomKeybinds()).toContainEqual(
            { key: 'h', label: '(h)ide \'no git\' message', action: 'toggle-nogit' }
        );
        expect(widget.getCustomKeybinds()).toContainEqual(
            { key: 'j', label: 'hide when (j)j present', action: 'toggle-hide-when-jj' }
        );
    });

    it.each(cases)('$name should toggle hideNoGit metadata', ({ widget, itemType }) => {
        const base: WidgetItem = { id: itemType, type: itemType };
        const toggledOn = widget.handleEditorAction('toggle-nogit', base);
        const toggledOff = widget.handleEditorAction('toggle-nogit', toggledOn ?? base);

        expect(toggledOn?.metadata?.hideNoGit).toBe('true');
        expect(toggledOff?.metadata?.hideNoGit).toBe('false');
    });

    it.each(cases)('$name should toggle hideWhenJj metadata', ({ widget, itemType }) => {
        const base: WidgetItem = { id: itemType, type: itemType };
        const toggledOn = widget.handleEditorAction('toggle-hide-when-jj', base);
        const toggledOff = widget.handleEditorAction('toggle-hide-when-jj', toggledOn ?? base);

        expect(toggledOn?.metadata?.hideWhenJj).toBe('true');
        expect(toggledOff?.metadata?.hideWhenJj).toBe('false');
    });

    it.each(cases)('$name should show hide-no-git modifier in editor display', ({ widget, itemType }) => {
        const display = widget.getEditorDisplay({
            id: itemType,
            type: itemType,
            metadata: { hideNoGit: 'true' }
        });

        expect(display.modifierText).toBe('(hide \'no git\')');
    });

    it.each(cases)('$name should show hide-when-jj modifier in editor display', ({ widget, itemType }) => {
        const display = widget.getEditorDisplay({
            id: itemType,
            type: itemType,
            metadata: { hideWhenJj: 'true' }
        });

        expect(display.modifierText).toBe('(hide when jj)');
    });

    it.each(cases)('$name should show combined modifiers in editor display', ({ widget, itemType }) => {
        const display = widget.getEditorDisplay({
            id: itemType,
            type: itemType,
            metadata: { hideNoGit: 'true', hideWhenJj: 'true' }
        });

        expect(display.modifierText).toBe('(hide \'no git\', hide when jj)');
    });
});