import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../../types/Widget';
import { GitAheadBehindWidget } from '../GitAheadBehind';
import { GitBranchWidget } from '../GitBranch';
import { GitConflictsWidget } from '../GitConflicts';
import { GitStagedWidget } from '../GitStaged';
import { GitStatusWidget } from '../GitStatus';
import { GitUnstagedWidget } from '../GitUnstaged';
import { GitUntrackedWidget } from '../GitUntracked';
import { GitWorktreeWidget } from '../GitWorktree';
import { GitWorktreeModeWidget } from '../GitWorktreeMode';
import { JjBookmarksWidget } from '../JjBookmarks';
import { JjWorkspaceWidget } from '../JjWorkspace';
import {
    formatSymbolPrefix,
    getSymbol,
    setSlotSymbol,
    type SymbolSlot
} from '../shared/symbol-override';

interface SymbolCase {
    name: string;
    itemType: string;
    widget: Widget;
    defaultPreview: string;
    overriddenPreview: string;
    suppressedPreview: string | null;
}

const cases: SymbolCase[] = [
    { name: 'GitBranchWidget', itemType: 'git-branch', widget: new GitBranchWidget(), defaultPreview: '⎇ main', overriddenPreview: '★ main', suppressedPreview: 'main' },
    { name: 'GitWorktreeWidget', itemType: 'git-worktree', widget: new GitWorktreeWidget(), defaultPreview: '𖠰 main', overriddenPreview: '★ main', suppressedPreview: 'main' },
    { name: 'JjBookmarksWidget', itemType: 'jj-bookmarks', widget: new JjBookmarksWidget(), defaultPreview: '🔖 main', overriddenPreview: '★ main', suppressedPreview: 'main' },
    { name: 'JjWorkspaceWidget', itemType: 'jj-workspace', widget: new JjWorkspaceWidget(), defaultPreview: '◆ default', overriddenPreview: '★ default', suppressedPreview: 'default' },
    { name: 'GitConflictsWidget', itemType: 'git-conflicts', widget: new GitConflictsWidget(), defaultPreview: '⚠ 2', overriddenPreview: '★ 2', suppressedPreview: '2' },
    { name: 'GitStagedWidget', itemType: 'git-staged', widget: new GitStagedWidget(), defaultPreview: '+', overriddenPreview: '★', suppressedPreview: '' },
    { name: 'GitUnstagedWidget', itemType: 'git-unstaged', widget: new GitUnstagedWidget(), defaultPreview: '*', overriddenPreview: '★', suppressedPreview: '' },
    { name: 'GitUntrackedWidget', itemType: 'git-untracked', widget: new GitUntrackedWidget(), defaultPreview: '?', overriddenPreview: '★', suppressedPreview: '' },
    { name: 'GitWorktreeModeWidget', itemType: 'worktree-mode', widget: new GitWorktreeModeWidget(), defaultPreview: '⎇', overriddenPreview: '★', suppressedPreview: null }
];

function makeItem(itemType: string, character?: string): WidgetItem {
    return {
        id: itemType,
        type: itemType,
        ...(character === undefined ? {} : { character })
    };
}

describe('symbol override rendering', () => {
    it.each(cases)('$name renders its default symbol', ({ widget, itemType, defaultPreview }) => {
        expect(widget.render(makeItem(itemType), { isPreview: true }, DEFAULT_SETTINGS)).toBe(defaultPreview);
    });

    it.each(cases)('$name renders a character override', ({ widget, itemType, overriddenPreview }) => {
        expect(widget.render(makeItem(itemType, '★'), { isPreview: true }, DEFAULT_SETTINGS)).toBe(overriddenPreview);
    });

    it.each(cases)('$name renders without a symbol on an empty override', ({ widget, itemType, suppressedPreview }) => {
        expect(widget.render(makeItem(itemType, ''), { isPreview: true }, DEFAULT_SETTINGS)).toBe(suppressedPreview);
    });

    it.each(cases)('$name exposes the shared glyph keybind and editor', ({ widget }) => {
        const keys = (widget.getCustomKeybinds?.() ?? []).map(keybind => keybind.key);
        expect(keys).toContain('g');
        expect(typeof widget.renderEditor).toBe('function');
    });
});

describe('multi-slot symbol overrides', () => {
    it('GitAheadBehindWidget renders ahead/behind symbol overrides', () => {
        const widget = new GitAheadBehindWidget();

        expect(widget.render(makeItem('git-ahead-behind'), { isPreview: true }, DEFAULT_SETTINGS)).toBe('↑2↓3');
        expect(widget.render({
            id: 'git-ahead-behind',
            type: 'git-ahead-behind',
            metadata: { symbolAhead: '▲', symbolBehind: '▼' }
        }, { isPreview: true }, DEFAULT_SETTINGS)).toBe('▲2▼3');
        expect(widget.render({
            id: 'git-ahead-behind',
            type: 'git-ahead-behind',
            metadata: { symbolAhead: '', symbolBehind: '' }
        }, { isPreview: true }, DEFAULT_SETTINGS)).toBe('23');
    });

    it('GitStatusWidget renders per-part symbol overrides', () => {
        const widget = new GitStatusWidget();

        expect(widget.render(makeItem('git-status'), { isPreview: true }, DEFAULT_SETTINGS)).toBe('+*');
        expect(widget.render({
            id: 'git-status',
            type: 'git-status',
            metadata: { symbolStaged: '●' }
        }, { isPreview: true }, DEFAULT_SETTINGS)).toBe('●*');
    });

    it('exposes the shared glyph keybind and editor on both widgets', () => {
        for (const widget of [new GitAheadBehindWidget(), new GitStatusWidget()] as Widget[]) {
            const keys = (widget.getCustomKeybinds?.() ?? []).map(keybind => keybind.key);
            expect(keys).toContain('g');
            expect(typeof widget.renderEditor).toBe('function');
        }
    });

    it('stores slot overrides in metadata and clears them on default', () => {
        const slot: SymbolSlot = { id: 'symbolAhead', label: 'Ahead', defaultSymbol: '↑' };
        const overridden = setSlotSymbol(makeItem('git-ahead-behind'), slot, '▲');
        expect(overridden.metadata).toEqual({ symbolAhead: '▲' });

        const cleared = setSlotSymbol(overridden, slot, '↑');
        expect(cleared.metadata).toBeUndefined();
    });
});

describe('symbol override helpers', () => {
    it('prefers the item character over the default', () => {
        expect(getSymbol(makeItem('git-branch'), '⎇')).toBe('⎇');
        expect(getSymbol(makeItem('git-branch', '★'), '⎇')).toBe('★');
        expect(getSymbol(makeItem('git-branch', ''), '⎇')).toBe('');
    });

    it('collapses the joining space for empty symbols', () => {
        expect(formatSymbolPrefix(makeItem('git-branch'), '⎇')).toBe('⎇ ');
        expect(formatSymbolPrefix(makeItem('git-branch', ''), '⎇')).toBe('');
    });

    it('stores character overrides and removes them when matching the default', () => {
        const characterSlot: SymbolSlot = { id: 'character', label: 'Glyph', defaultSymbol: '⎇' };
        const overridden = setSlotSymbol(makeItem('git-branch'), characterSlot, '★');
        expect(overridden.character).toBe('★');

        const cleared = setSlotSymbol(overridden, characterSlot, '⎇');
        expect('character' in cleared).toBe(false);

        const suppressed = setSlotSymbol(makeItem('git-branch'), characterSlot, '');
        expect(suppressed.character).toBe('');
    });
});
