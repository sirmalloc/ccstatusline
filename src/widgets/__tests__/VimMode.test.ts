import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { VimModeWidget } from '../VimMode';

const ITEM: WidgetItem = { id: 'vim-mode', type: 'vim-mode' };

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { ...overrides };
}

describe('VimModeWidget', () => {
    describe('editor configuration', () => {
        it('uses f as the format toggle keybind', () => {
            expect(new VimModeWidget().getCustomKeybinds()).toEqual([
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 'n', label: '(n)erd font', action: 'toggle-nerd-font' }
            ]);
        });

        it('defaults to icon-dash-letter in the editor display', () => {
            expect(new VimModeWidget().getEditorDisplay(ITEM)).toEqual({
                displayText: 'Vim Mode',
                modifierText: '(icon-dash-letter)'
            });
        });

        it('shows nerd font in the editor display when enabled', () => {
            expect(new VimModeWidget().getEditorDisplay({
                ...ITEM,
                metadata: { nerdFont: 'true' }
            })).toEqual({
                displayText: 'Vim Mode',
                modifierText: '(icon-dash-letter, nerd font)'
            });
        });

        it('cycles icon-dash-letter -> icon-letter -> icon -> letter -> word -> icon-dash-letter', () => {
            const widget = new VimModeWidget();
            const iconLetter = widget.handleEditorAction('cycle-format', ITEM);
            const icon = widget.handleEditorAction('cycle-format', iconLetter ?? ITEM);
            const letter = widget.handleEditorAction('cycle-format', icon ?? ITEM);
            const word = widget.handleEditorAction('cycle-format', letter ?? ITEM);
            const iconDashLetter = widget.handleEditorAction('cycle-format', word ?? ITEM);

            expect(iconLetter?.metadata?.format).toBe('icon-letter');
            expect(icon?.metadata?.format).toBe('icon');
            expect(letter?.metadata?.format).toBe('letter');
            expect(word?.metadata?.format).toBe('word');
            expect(iconDashLetter?.metadata?.format).toBeUndefined();
        });

        it('toggles nerd font metadata on and off', () => {
            const widget = new VimModeWidget();
            const enabled = widget.handleEditorAction('toggle-nerd-font', ITEM);
            const disabled = widget.handleEditorAction('toggle-nerd-font', enabled ?? ITEM);

            expect(enabled?.metadata?.nerdFont).toBe('true');
            expect(disabled?.metadata?.nerdFont).toBeUndefined();
        });
    });

    describe('metadata', () => {
        it('has correct display name', () => {
            expect(new VimModeWidget().getDisplayName()).toBe('Vim Mode');
        });

        it('has correct category', () => {
            expect(new VimModeWidget().getCategory()).toBe('Core');
        });

        it('does not support raw value', () => {
            expect(new VimModeWidget().supportsRawValue()).toBe(false);
        });

        it('supports colors', () => {
            expect(new VimModeWidget().supportsColors(ITEM)).toBe(true);
        });
    });

    describe('render()', () => {
        it('returns v-N by default', () => {
            const ctx = makeContext({ data: { vim: { mode: 'NORMAL' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('v-N');
        });

        it('returns v-I by default for INSERT', () => {
            const ctx = makeContext({ data: { vim: { mode: 'INSERT' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('v-I');
        });

        it('renders alternate configured formats', () => {
            const ctx = makeContext({ data: { vim: { mode: 'NORMAL' } } });

            expect(new VimModeWidget().render({
                ...ITEM,
                metadata: { format: 'letter' }
            }, ctx, DEFAULT_SETTINGS)).toBe('N');
            expect(new VimModeWidget().render({
                ...ITEM,
                metadata: { format: 'word' }
            }, ctx, DEFAULT_SETTINGS)).toBe('NORMAL');
        });

        it('renders the Nerd Font glyph when enabled', () => {
            const ctx = makeContext({ data: { vim: { mode: 'NORMAL' } } });

            expect(new VimModeWidget().render({
                ...ITEM,
                metadata: { nerdFont: 'true' }
            }, ctx, DEFAULT_SETTINGS)).toBe('\uE62B-N');
        });

        it('returns null when vim field is absent (vim disabled)', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-5' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when vim field is null', () => {
            const ctx = makeContext({ data: { vim: null } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when context.data is absent', () => {
            const ctx = makeContext();
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns v-N in preview mode regardless of data', () => {
            const ctx = makeContext({ isPreview: true });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('v-N');
        });

        it('returns v-C for unknown modes by default', () => {
            const ctx = makeContext({ data: { vim: { mode: 'COMMAND' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('v-C');
        });
    });
});