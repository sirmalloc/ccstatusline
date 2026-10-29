import { execFileSync } from 'node:child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../../types/Widget';
import { mockExecutableResolution } from '../../utils/__tests__/executable-path-test-helpers';
import {
    gitCommandOf,
    isolateGitWorkingDirectory
} from '../../utils/__tests__/git-test-helpers';
import { clearGitCache } from '../../utils/git';
import { GitChangesWidget } from '../GitChanges';
import { GitDeletionsWidget } from '../GitDeletions';
import { GitInsertionsWidget } from '../GitInsertions';
import { GitStagedFilesWidget } from '../GitStagedFiles';
import { GitUnstagedFilesWidget } from '../GitUnstagedFiles';
import { GitUntrackedFilesWidget } from '../GitUntrackedFiles';
import type { SymbolSlot } from '../shared/symbol-override';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as { mockImplementation: (impl: (command: string, args: string[], options?: { cwd?: string }) => string) => void };

// Repositories keyed by working directory: what `git status --porcelain -z`,
// `git diff --shortstat` and `git diff --cached --shortstat` print there.
// '/repos/none' is not a git work tree.
const REPOS: Record<string, { status: string; unstagedStat: string; stagedStat: string }> = {
    // 3 staged, 2 unstaged and 2 untracked files; 11 lines added, 9 removed
    '/repos/dirty': {
        status: 'M  a.ts\0A  b.ts\0 M c.ts\0MM d.ts\0?? e.ts\0?? f/\0',
        unstagedStat: ' 2 files changed, 4 insertions(+), 9 deletions(-)',
        stagedStat: ' 2 files changed, 7 insertions(+)'
    },
    '/repos/clean': { status: '', unstagedStat: '', stagedStat: '' },
    // Only removed lines, unstaged
    '/repos/removed': { status: ' M a.ts\0', unstagedStat: ' 1 file changed, 3 deletions(-)', stagedStat: '' },
    // Only added lines, staged
    '/repos/added': { status: 'M  a.ts\0', unstagedStat: '', stagedStat: ' 1 file changed, 2 insertions(+)' },
    // One untracked file, so no line changes
    '/repos/untracked': { status: '?? a.ts\0', unstagedStat: '', stagedStat: '' }
};

// Answers the four commands these widgets run like git would
beforeEach(() => {
    clearGitCache();
    mockExecFileSync.mockImplementation((_command, args, options) => {
        const repo = REPOS[options?.cwd ?? ''];
        if (!repo) {
            throw new Error('fatal: not a git repository');
        }
        const outputs: Record<string, string> = {
            'rev-parse --is-inside-work-tree': 'true\n',
            'status --porcelain -z': repo.status,
            'diff --shortstat': repo.unstagedStat,
            'diff --cached --shortstat': repo.stagedStat
        };
        const output = outputs[gitCommandOf(args)];
        if (output === undefined) {
            throw new Error(`unexpected git ${gitCommandOf(args)}`);
        }
        return output;
    });
});

const live = (repo: string): RenderContext => ({ isPreview: false, gitCacheTtlSeconds: 0, data: { cwd: `/repos/${repo}` } });
const preview: RenderContext = { isPreview: true };

function render(widget: Widget, type: string, context: RenderContext, item: Partial<WidgetItem> = {}): string | null {
    return widget.render({ id: 'w', type, ...item }, context, DEFAULT_SETTINGS);
}

// Each widget: its name and color, the label of its zero hide state, whether it
// has a raw mode, its preview (labeled, then raw), and what it shows in each
// repository: labeled, raw, and with the zero state hidden
interface WidgetCase {
    type: string;
    widget: Widget;
    name: string;
    color: string;
    zeroLabel: string;
    raw: boolean;
    preview: [string, string];
    shows: Record<string, [string, string, string | null]>;
}

const WIDGETS: WidgetCase[] = [
    {
        type: 'git-staged-files', widget: new GitStagedFilesWidget(), name: 'Git Staged Files', color: 'green',
        zeroLabel: 'when the staged file count is zero', raw: true, preview: ['S:3', '3'],
        shows: { dirty: ['S:3', '3', 'S:3'], clean: ['S:0', '0', null], removed: ['S:0', '0', null], added: ['S:1', '1', 'S:1'], untracked: ['S:0', '0', null] }
    },
    {
        type: 'git-unstaged-files', widget: new GitUnstagedFilesWidget(), name: 'Git Unstaged Files', color: 'yellow',
        zeroLabel: 'when the unstaged file count is zero', raw: true, preview: ['M:2', '2'],
        shows: { dirty: ['M:2', '2', 'M:2'], clean: ['M:0', '0', null], removed: ['M:1', '1', 'M:1'], added: ['M:0', '0', null], untracked: ['M:0', '0', null] }
    },
    {
        type: 'git-untracked-files', widget: new GitUntrackedFilesWidget(), name: 'Git Untracked Files', color: 'red',
        zeroLabel: 'when the untracked file count is zero', raw: true, preview: ['?:1', '1'],
        shows: { dirty: ['?:2', '2', '?:2'], clean: ['?:0', '0', null], removed: ['?:0', '0', null], added: ['?:0', '0', null], untracked: ['?:1', '1', '?:1'] }
    },
    // No raw mode: a raw item shows the same as a labeled one
    {
        type: 'git-insertions', widget: new GitInsertionsWidget(), name: 'Git Insertions', color: 'green',
        zeroLabel: 'when the insertion count is zero', raw: false, preview: ['+42', '+42'],
        shows: { dirty: ['+11', '+11', '+11'], clean: ['+0', '+0', null], removed: ['+0', '+0', null], added: ['+2', '+2', '+2'], untracked: ['+0', '+0', null] }
    },
    {
        type: 'git-deletions', widget: new GitDeletionsWidget(), name: 'Git Deletions', color: 'red',
        zeroLabel: 'when the deletion count is zero', raw: false, preview: ['-10', '-10'],
        shows: { dirty: ['-9', '-9', '-9'], clean: ['-0', '-0', null], removed: ['-3', '-3', '-3'], added: ['-0', '-0', null], untracked: ['-0', '-0', null] }
    },
    {
        type: 'git-changes', widget: new GitChangesWidget(), name: 'Git Changes', color: 'yellow',
        zeroLabel: 'when there are no changes', raw: false, preview: ['(+42,-10)', '(+42,-10)'],
        shows: { dirty: ['(+11,-9)', '(+11,-9)', '(+11,-9)'], clean: ['(+0,-0)', '(+0,-0)', null], removed: ['(+0,-3)', '(+0,-3)', '(+0,-3)'], added: ['(+2,-0)', '(+2,-0)', '(+2,-0)'], untracked: ['(+0,-0)', '(+0,-0)', null] }
    }
];

mockExecutableResolution();
isolateGitWorkingDirectory();

describe.each(WIDGETS)('$type', ({ type, widget, name, color, zeroLabel, raw, preview: [previewText, previewRaw], shows }) => {
    it('shows its sample in the preview, labeled and raw', () => {
        expect(render(widget, type, preview)).toBe(previewText);
        expect(render(widget, type, preview, { rawValue: true })).toBe(previewRaw);
        // Hide states only apply to real data
        expect(render(widget, type, preview, { metadata: { hide: 'no-git,zero' } })).toBe(previewText);
    });

    it.each(Object.entries(shows))('reads the %s repository', (repo, [text, rawText, zeroHiddenText]) => {
        expect(render(widget, type, live(repo))).toBe(text);
        expect(render(widget, type, live(repo), { rawValue: true })).toBe(rawText);
        expect(render(widget, type, live(repo), { metadata: { hide: 'zero' } })).toBe(zeroHiddenText);
        expect(render(widget, type, live(repo), { metadata: { hide: 'no-git' } })).toBe(text);
    });

    it('shows (no git) outside a work tree, or nothing when that state is hidden', () => {
        expect(render(widget, type, live('none'))).toBe('(no git)');
        expect(render(widget, type, live('none'), { rawValue: true })).toBe('(no git)');
        expect(render(widget, type, live('none'), { metadata: { hide: 'zero' } })).toBe('(no git)');
        expect(render(widget, type, live('none'), { metadata: { hide: 'no-git' } })).toBeNull();
    });

    it('declares its name, color, editor label, hide states and raw mode', () => {
        expect(widget.getDisplayName()).toBe(name);
        expect(widget.getDefaultColor()).toBe(color);
        expect(widget.getCategory()).toBe('Git');
        expect(widget.getEditorDisplay({ id: 'w', type, metadata: { hide: 'no-git,zero' } })).toEqual({ displayText: name });
        expect(widget.getHideableStates?.()).toEqual([
            { key: 'no-git', label: 'when not in a git repo' },
            { key: 'zero', label: zeroLabel }
        ]);
        expect(widget.supportsRawValue()).toBe(raw);
        expect(widget.supportsColors({ id: 'w', type })).toBe(true);
    });
});

describe('Git Staged, Unstaged and Untracked Files', () => {
    const FILES: { type: string; widget: Widget; dirty: number }[] = [
        { type: 'git-staged-files', widget: new GitStagedFilesWidget(), dirty: 3 },
        { type: 'git-unstaged-files', widget: new GitUnstagedFilesWidget(), dirty: 2 },
        { type: 'git-untracked-files', widget: new GitUntrackedFilesWidget(), dirty: 2 }
    ];

    it.each(FILES)('$type reports its count as a number, and nothing outside a work tree', ({ type, widget, dirty }) => {
        const item: WidgetItem = { id: 'w', type };
        expect(widget.getNumericValue?.(live('dirty'), item)).toBe(dirty);
        expect(widget.getNumericValue?.(live('clean'), item)).toBe(0);
        expect(widget.getNumericValue?.(live('none'), item)).toBeNull();
    });

    it.each(FILES)('$type has no keys of its own', ({ widget }) => {
        expect('getCustomKeybinds' in widget).toBe(false);
        expect('renderEditor' in widget).toBe(false);
    });

    it.each(FILES)('$type exposes an editable label for live and preview counts', ({ type, widget }) => {
        const item: WidgetItem = { id: 'w', type };
        const defaults: Record<string, string> = { 'git-staged-files': 'S:', 'git-unstaged-files': 'M:', 'git-untracked-files': '?:' };
        expect(widget.getLabelPrefix?.(item)).toBe(defaults[type]);
        for (const context of [live('dirty'), preview]) {
            const value = render(widget, type, context, { rawValue: true });
            expect(render(widget, type, context, { metadata: { label: 'Files ' } })).toBe(`Files ${value}`);
            expect(render(widget, type, context, { metadata: { label: '' } })).toBe(value);
            expect(render(widget, type, context, { rawValue: true, metadata: { label: 'Files ' } })).toBe(value);
        }
    });
});

// The glyph editor's rows, as passed to the shared symbol editor
function editorSlots(widget: Widget, type: string): SymbolSlot[] {
    const element = widget.renderEditor?.({ widget: { id: 'w', type }, onComplete: vi.fn(), onCancel: vi.fn() });
    return (element?.props as { slots: SymbolSlot[] }).slots;
}

describe('Git Insertions, Deletions and Changes glyphs', () => {
    const overrides = { symbolInsertions: '▲', symbolDeletions: '▼' };
    const GLYPHS: { type: string; widget: Widget; slots: [string, string][]; overridden: string; emptied: string }[] = [
        { type: 'git-insertions', widget: new GitInsertionsWidget(), slots: [['symbolInsertions', '+']], overridden: '▲11', emptied: '11' },
        { type: 'git-deletions', widget: new GitDeletionsWidget(), slots: [['symbolDeletions', '-']], overridden: '▼9', emptied: '9' },
        { type: 'git-changes', widget: new GitChangesWidget(), slots: [['symbolInsertions', '+'], ['symbolDeletions', '-']], overridden: '(▲11,▼9)', emptied: '(11,9)' }
    ];

    it.each(GLYPHS)('$type shows its glyph overrides in a repository, and none when emptied', ({ type, widget, overridden, emptied }) => {
        expect(render(widget, type, live('dirty'), { metadata: overrides })).toBe(overridden);
        expect(render(widget, type, live('dirty'), { metadata: { symbolInsertions: '', symbolDeletions: '' } })).toBe(emptied);
        // The character override belongs to other widgets
        expect(render(widget, type, live('dirty'), { character: '★' })).toBe(render(widget, type, live('dirty')));
    });

    it.each(GLYPHS)('$type edits its glyphs with (g)', ({ type, widget, slots }) => {
        expect(widget.getCustomKeybinds?.()).toEqual([{ key: 'g', label: '(g)lyph', action: 'edit-symbol-override' }]);
        expect(editorSlots(widget, type).map(slot => [slot.id, slot.defaultSymbol])).toEqual(slots);
    });

    it.each(GLYPHS)('$type reports no numeric value', ({ widget }) => {
        expect('getNumericValue' in widget).toBe(false);
    });
});
