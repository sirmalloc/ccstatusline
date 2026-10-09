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
import { GitCleanStatusWidget } from '../GitCleanStatus';
import { GitShaWidget } from '../GitSha';
import { GitStagedWidget } from '../GitStaged';
import { GitStatusWidget } from '../GitStatus';
import { GitUnstagedWidget } from '../GitUnstaged';
import { GitUntrackedWidget } from '../GitUntracked';
import type { SymbolSlot } from '../shared/symbol-override';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as { mockImplementation: (impl: (command: string, args: string[], options?: { cwd?: string }) => string) => void };

// Repositories keyed by working directory: what `git status --porcelain -z`
// prints there, and the short HEAD SHA (none before the first commit).
// '/repos/none' is not a git work tree.
const REPOS: Record<string, { status: string; sha?: string }> = {
    '/repos/dirty': { status: 'M  app.ts\0 M lib.ts\0?? notes.md\0', sha: 'abc1234' },
    '/repos/clean': { status: '', sha: 'def5678' },
    '/repos/staged': { status: 'A  new.ts\0', sha: '1111111' },
    '/repos/unstaged': { status: ' M lib.ts\0', sha: '2222222' },
    '/repos/untracked': { status: '?? notes.md\0', sha: '3333333' },
    '/repos/conflict': { status: 'UU f.txt\0', sha: '4444444' },
    '/repos/empty': { status: '?? readme.md\0' }
};

// Answers the three commands these widgets run like git would
beforeEach(() => {
    clearGitCache();
    mockExecFileSync.mockImplementation((_command, args, options) => {
        const repo = REPOS[options?.cwd ?? ''];
        const command = gitCommandOf(args);
        if (repo && command === 'rev-parse --is-inside-work-tree') {
            return 'true\n';
        }
        if (repo && command === 'status --porcelain -z') {
            return repo.status;
        }
        if (repo?.sha && command === 'rev-parse --short HEAD') {
            return `${repo.sha}\n`;
        }
        throw new Error('fatal: not a git repository');
    });
});

const live = (repo: string): RenderContext => ({ isPreview: false, gitCacheTtlSeconds: 0, data: { cwd: `/repos/${repo}` } });
const preview: RenderContext = { isPreview: true };

function render(widget: Widget, type: string, context: RenderContext, item: Partial<WidgetItem> = {}): string | null {
    return widget.render({ id: 'w', type, ...item }, context, DEFAULT_SETTINGS);
}

// Each widget: its name and color, whether it has a raw mode and glyphs, its
// preview (labeled, then raw), and what it shows in each repository (labeled,
// then raw for the widgets with a raw mode)
interface WidgetCase {
    type: string;
    widget: Widget;
    name: string;
    color: string;
    raw: boolean;
    glyphs: boolean;
    preview: [string, string?];
    shows: Record<string, [string | null, (string | null)?]>;
}

const WIDGETS: WidgetCase[] = [
    {
        type: 'git-staged', widget: new GitStagedWidget(), name: 'Git Staged', color: 'green', raw: true, glyphs: true,
        preview: ['+', 'true'],
        shows: { dirty: ['+', 'true'], clean: [null, null], staged: ['+', 'true'], unstaged: [null, null], untracked: [null, null], conflict: ['+', 'true'], empty: [null, null] }
    },
    {
        type: 'git-unstaged', widget: new GitUnstagedWidget(), name: 'Git Unstaged', color: 'yellow', raw: true, glyphs: true,
        preview: ['*', 'true'],
        shows: { dirty: ['*', 'true'], clean: [null, null], staged: [null, null], unstaged: ['*', 'true'], untracked: [null, null], conflict: ['*', 'true'], empty: [null, null] }
    },
    {
        type: 'git-untracked', widget: new GitUntrackedWidget(), name: 'Git Untracked', color: 'red', raw: true, glyphs: true,
        preview: ['?', 'true'],
        shows: { dirty: ['?', 'true'], clean: [null, null], staged: [null, null], unstaged: [null, null], untracked: ['?', 'true'], conflict: [null, null], empty: ['?', 'true'] }
    },
    {
        type: 'git-clean-status', widget: new GitCleanStatusWidget(), name: 'Git Clean Status', color: 'green', raw: true, glyphs: true,
        preview: ['✓', 'clean'],
        shows: { dirty: ['✗', 'dirty'], clean: ['✓', 'clean'], staged: ['✗', 'dirty'], unstaged: ['✗', 'dirty'], untracked: ['✗', 'dirty'], conflict: ['✗', 'dirty'], empty: ['✗', 'dirty'] }
    },
    {
        type: 'git-status', widget: new GitStatusWidget(), name: 'Git Status', color: 'yellow', raw: false, glyphs: true,
        preview: ['+*'],
        shows: { dirty: ['+*?'], clean: [null], staged: ['+'], unstaged: ['*'], untracked: ['?'], conflict: ['!+*'], empty: ['?'] }
    },
    {
        type: 'git-sha', widget: new GitShaWidget(), name: 'Git SHA', color: 'gray', raw: false, glyphs: false,
        preview: ['a1b2c3d'],
        shows: { dirty: ['abc1234'], clean: ['def5678'], staged: ['1111111'], unstaged: ['2222222'], untracked: ['3333333'], conflict: ['4444444'], empty: ['(no commit)'] }
    }
];

mockExecutableResolution();
isolateGitWorkingDirectory();

describe.each(WIDGETS)('$type', ({ type, widget, name, color, raw, glyphs, preview: [previewText, previewRaw], shows }) => {
    it('shows its sample in the preview, raw too when it has a raw mode', () => {
        expect(render(widget, type, preview)).toBe(previewText);
        if (raw) {
            expect(render(widget, type, preview, { rawValue: true })).toBe(previewRaw);
        }
    });

    it.each(Object.entries(shows))('reads the %s repository', (repo, [text, rawText]) => {
        expect(render(widget, type, live(repo))).toBe(text);
        if (raw) {
            expect(render(widget, type, live(repo), { rawValue: true })).toBe(rawText);
        }
    });

    it('shows (no git) outside a work tree, or nothing when that state is hidden', () => {
        expect(render(widget, type, live('none'))).toBe('(no git)');
        expect(render(widget, type, live('none'), { rawValue: true })).toBe('(no git)');
        expect(render(widget, type, live('none'), { metadata: { hide: 'no-git' } })).toBeNull();
        // Hiding no-git changes nothing inside a work tree
        expect(render(widget, type, live('dirty'), { metadata: { hide: 'no-git' } })).toBe(shows.dirty?.[0]);
    });

    it('declares its name, color, editor label, hide state and keys', () => {
        expect(widget.getDisplayName()).toBe(name);
        expect(widget.getDefaultColor()).toBe(color);
        expect(widget.getCategory()).toBe('Git');
        expect(widget.getEditorDisplay({ id: 'w', type, metadata: { hide: 'no-git' } })).toEqual({ displayText: name });
        expect(widget.getHideableStates?.()).toEqual([{ key: 'no-git', label: 'when not in a git repo' }]);
        expect(widget.getCustomKeybinds?.()).toEqual(glyphs ? [{ key: 'g', label: '(g)lyph', action: 'edit-symbol-override' }] : undefined);
        expect(typeof widget.renderEditor).toBe(glyphs ? 'function' : 'undefined');
        expect(widget.supportsRawValue()).toBe(raw);
        expect(widget.supportsColors({ id: 'w', type })).toBe(true);
    });
});

// The glyph editor's rows, as passed to the shared symbol editor
function editorSlots(widget: Widget, type: string): SymbolSlot[] {
    const element = widget.renderEditor?.({ widget: { id: 'w', type }, onComplete: vi.fn(), onCancel: vi.fn() });
    return (element?.props as { slots: SymbolSlot[] }).slots;
}

describe('Git Staged, Unstaged and Untracked', () => {
    const FLAGS: { type: string; widget: Widget; glyph: string; set: string; unset: string }[] = [
        { type: 'git-staged', widget: new GitStagedWidget(), glyph: '+', set: 'staged', unset: 'unstaged' },
        { type: 'git-unstaged', widget: new GitUnstagedWidget(), glyph: '*', set: 'unstaged', unset: 'untracked' },
        { type: 'git-untracked', widget: new GitUntrackedWidget(), glyph: '?', set: 'untracked', unset: 'staged' }
    ];

    it.each(FLAGS)('$type shows its glyph override in a repository, and none when emptied', ({ type, widget, set, unset }) => {
        expect(render(widget, type, live(set), { character: '★' })).toBe('★');
        expect(render(widget, type, live(set), { character: '' })).toBe('');
        expect(render(widget, type, live(set), { character: '★', rawValue: true })).toBe('true');
        expect(render(widget, type, live(unset), { character: '★' })).toBeNull();
    });

    it.each(FLAGS)('$type edits one glyph defaulting to $glyph', ({ type, widget, glyph }) => {
        expect(editorSlots(widget, type)).toEqual([{ id: 'character', label: 'Glyph', defaultSymbol: glyph }]);
    });

    it.each(FLAGS)('$type counts 1 while its change is present, 0 otherwise, and nothing outside a work tree', ({ type, widget, set, unset }) => {
        const item: WidgetItem = { id: 'w', type };
        expect(widget.getNumericValue?.(live(set), item)).toBe(1);
        expect(widget.getNumericValue?.(live(unset), item)).toBe(0);
        expect(widget.getNumericValue?.(live('none'), item)).toBeNull();
    });

    it('only these three report a numeric value', () => {
        const others: Widget[] = [new GitCleanStatusWidget(), new GitStatusWidget(), new GitShaWidget()];
        for (const widget of others) {
            expect('getNumericValue' in widget).toBe(false);
        }
    });
});

describe('Git Clean Status glyphs', () => {
    const widget = new GitCleanStatusWidget();
    const overrides = { symbolClean: 'C', symbolDirty: 'D' };

    it('shows the clean and dirty overrides, and the words when raw', () => {
        expect(render(widget, 'git-clean-status', live('clean'), { metadata: overrides })).toBe('C');
        expect(render(widget, 'git-clean-status', live('conflict'), { metadata: overrides })).toBe('D');
        expect(render(widget, 'git-clean-status', preview, { metadata: overrides })).toBe('C');
        expect(render(widget, 'git-clean-status', live('dirty'), { metadata: overrides, rawValue: true })).toBe('dirty');
    });

    it('edits the clean and dirty glyphs', () => {
        expect(editorSlots(widget, 'git-clean-status').map(slot => [slot.id, slot.defaultSymbol])).toEqual([['symbolClean', '✓'], ['symbolDirty', '✗']]);
    });
});

describe('Git Status glyphs', () => {
    const widget = new GitStatusWidget();
    const overrides = { symbolConflicts: 'C', symbolStaged: 'S', symbolUnstaged: 'U', symbolUntracked: 'T' };

    it('shows the overrides in order: conflicts, staged, unstaged, untracked', () => {
        expect(render(widget, 'git-status', live('conflict'), { metadata: overrides })).toBe('CSU');
        expect(render(widget, 'git-status', live('dirty'), { metadata: overrides })).toBe('SUT');
        expect(render(widget, 'git-status', preview, { metadata: overrides })).toBe('SU');
        expect(render(widget, 'git-status', live('dirty'), { metadata: { symbolUnstaged: '' } })).toBe('+?');
    });

    it('edits one glyph per indicator', () => {
        expect(editorSlots(widget, 'git-status').map(slot => [slot.id, slot.defaultSymbol])).toEqual([
            ['symbolConflicts', '!'],
            ['symbolStaged', '+'],
            ['symbolUnstaged', '*'],
            ['symbolUntracked', '?']
        ]);
    });
});

describe('Git SHA before the first commit', () => {
    const widget = new GitShaWidget();

    it('shows (no commit), or nothing when no-git is hidden', () => {
        expect(render(widget, 'git-sha', live('empty'))).toBe('(no commit)');
        expect(render(widget, 'git-sha', live('empty'), { metadata: { hide: 'no-git' } })).toBeNull();
    });
});
