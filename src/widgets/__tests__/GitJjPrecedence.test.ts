import { execFileSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../../types/Widget';
import { clearGitCache } from '../../utils/git';
import { GitBranchWidget } from '../GitBranch';
import { GitChangesWidget } from '../GitChanges';
import { GitDeletionsWidget } from '../GitDeletions';
import { GitInsertionsWidget } from '../GitInsertions';
import { GitRootDirWidget } from '../GitRootDir';
import { GitShaWidget } from '../GitSha';
import { GitWorktreeWidget } from '../GitWorktree';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as { mockImplementation: (impl: (cmd: string, args: string[]) => string) => void };

// Responds to whichever git/jj probe each widget makes so a single mock can
// drive all 7 widgets without per-widget call-order bookkeeping.
function installExecMock(options: { insideJjRepo: boolean }): void {
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'jj') {
            if (args[0] === 'root') {
                if (!options.insideJjRepo)
                    throw new Error('not a jj repo');
                return '/tmp/repo\n';
            }
            throw new Error(`unexpected jj args: ${args.join(' ')}`);
        }

        if (cmd === 'git') {
            if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree')
                return 'true\n';
            if (args[0] === 'symbolic-ref' && args[1] === '--short')
                return 'main';
            if (args[0] === 'rev-parse' && args[1] === '--short')
                return 'a1b2c3d';
            if (args[0] === 'diff' && args[1] === '--stat')
                return ' file.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)';
            if (args[0] === 'rev-parse' && args[1] === '--show-toplevel')
                return '/tmp/my-repo';
            if (args[0] === 'rev-parse' && args[1] === '--git-dir')
                return '.git';
            throw new Error(`unexpected git args: ${args.join(' ')}`);
        }

        throw new Error(`unexpected command: ${cmd}`);
    });
}

function makeSettings(gitItem: WidgetItem, jjItem?: WidgetItem): Settings {
    return {
        ...DEFAULT_SETTINGS,
        lines: [jjItem ? [gitItem, jjItem] : [gitItem]]
    };
}

const context: RenderContext = {};

const cases: {
    gitType: string;
    jjType: string;
    name: string;
    widget: Widget;
}[] = [
    { name: 'GitBranchWidget', gitType: 'git-branch', jjType: 'jj-bookmarks', widget: new GitBranchWidget() },
    { name: 'GitShaWidget', gitType: 'git-sha', jjType: 'jj-revision', widget: new GitShaWidget() },
    { name: 'GitChangesWidget', gitType: 'git-changes', jjType: 'jj-changes', widget: new GitChangesWidget() },
    { name: 'GitInsertionsWidget', gitType: 'git-insertions', jjType: 'jj-insertions', widget: new GitInsertionsWidget() },
    { name: 'GitDeletionsWidget', gitType: 'git-deletions', jjType: 'jj-deletions', widget: new GitDeletionsWidget() },
    { name: 'GitRootDirWidget', gitType: 'git-root-dir', jjType: 'jj-root-dir', widget: new GitRootDirWidget() },
    { name: 'GitWorktreeWidget', gitType: 'git-worktree', jjType: 'jj-workspace', widget: new GitWorktreeWidget() }
];

describe('Git widgets defer to their Jj analog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it.each(cases)('$name renders normally when no Jj analog is configured', ({ gitType, widget }) => {
        installExecMock({ insideJjRepo: true });
        const item: WidgetItem = { id: gitType, type: gitType };
        const settings = makeSettings(item);

        expect(widget.render(item, context, settings)).not.toBeNull();
    });

    it.each(cases)('$name renders normally when Jj analog is configured but not in a jj repo', ({ gitType, jjType, widget }) => {
        installExecMock({ insideJjRepo: false });
        const item: WidgetItem = { id: gitType, type: gitType };
        const jjItem: WidgetItem = { id: jjType, type: jjType };
        const settings = makeSettings(item, jjItem);

        expect(widget.render(item, context, settings)).not.toBeNull();
    });

    it.each(cases)('$name hides once its Jj analog is configured in a jj repo', ({ gitType, jjType, widget }) => {
        installExecMock({ insideJjRepo: true });
        const item: WidgetItem = { id: gitType, type: gitType, metadata: { hideNoGit: 'false' } };
        const jjItem: WidgetItem = { id: jjType, type: jjType };
        const settings = makeSettings(item, jjItem);

        expect(widget.render(item, context, settings)).toBeNull();
    });

    it.each(cases)('$name hides even when the Jj analog is on a different configured line', ({ gitType, jjType, widget }) => {
        installExecMock({ insideJjRepo: true });
        const item: WidgetItem = { id: gitType, type: gitType };
        const jjItem: WidgetItem = { id: jjType, type: jjType };
        const settings: Settings = { ...DEFAULT_SETTINGS, lines: [[item], [jjItem]] };

        expect(widget.render(item, context, settings)).toBeNull();
    });
});
