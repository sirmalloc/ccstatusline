import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    Widget,
    WidgetItem
} from '../../types';
import { GitBranchWidget } from '../GitBranch';
import { GitChangesWidget } from '../GitChanges';
import { GitCleanStatusWidget } from '../GitCleanStatus';
import { GitDeletionsWidget } from '../GitDeletions';
import { GitInsertionsWidget } from '../GitInsertions';
import { GitPrWidget } from '../GitPr';
import { GitRootDirWidget } from '../GitRootDir';
import { GitStagedFilesWidget } from '../GitStagedFiles';
import { GitUnstagedFilesWidget } from '../GitUnstagedFiles';
import { GitUntrackedFilesWidget } from '../GitUntrackedFiles';
import { GitWorktreeWidget } from '../GitWorktree';
import { getEnabledHideStates } from '../shared/hideable';

const cases: { name: string; itemType: string; widget: Widget }[] = [
    { name: 'GitBranchWidget', itemType: 'git-branch', widget: new GitBranchWidget() },
    { name: 'GitChangesWidget', itemType: 'git-changes', widget: new GitChangesWidget() },
    { name: 'GitInsertionsWidget', itemType: 'git-insertions', widget: new GitInsertionsWidget() },
    { name: 'GitDeletionsWidget', itemType: 'git-deletions', widget: new GitDeletionsWidget() },
    { name: 'GitStagedFilesWidget', itemType: 'git-staged-files', widget: new GitStagedFilesWidget() },
    { name: 'GitUnstagedFilesWidget', itemType: 'git-unstaged-files', widget: new GitUnstagedFilesWidget() },
    { name: 'GitUntrackedFilesWidget', itemType: 'git-untracked-files', widget: new GitUntrackedFilesWidget() },
    { name: 'GitCleanStatusWidget', itemType: 'git-clean-status', widget: new GitCleanStatusWidget() },
    { name: 'GitPrWidget', itemType: 'git-review', widget: new GitPrWidget() },
    { name: 'GitRootDirWidget', itemType: 'git-root-dir', widget: new GitRootDirWidget() },
    { name: 'GitWorktreeWidget', itemType: 'git-worktree', widget: new GitWorktreeWidget() }
];

describe('Git widget shared behavior', () => {
    it.each(cases)('$name should declare the no-git hideable state', ({ widget }) => {
        const states = widget.getHideableStates?.() ?? [];
        expect(states.map(state => state.key)).toContain('no-git');
    });

    it.each(cases)('$name should not declare per-widget hide keybinds', ({ widget }) => {
        const keybinds = widget.getCustomKeybinds?.() ?? [];
        expect(keybinds.find(kb => kb.key === 'h')).toBeUndefined();
    });

    it.each(cases)('$name should enable no-git via the unified hide metadata', ({ widget, itemType }) => {
        const item: WidgetItem = {
            id: itemType,
            type: itemType,
            metadata: { hide: 'no-git' }
        };

        expect(getEnabledHideStates(item, widget.getHideableStates?.() ?? [])).toContain('no-git');
    });
});
