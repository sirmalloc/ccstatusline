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
        it('returns vim icon + N when vim mode is NORMAL', () => {
            const ctx = makeContext({ data: { vim: { mode: 'NORMAL' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('\uE62B-N');
        });

        it('returns vim icon + I when vim mode is INSERT', () => {
            const ctx = makeContext({ data: { vim: { mode: 'INSERT' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('\uE62B-I');
        });

        it('returns null when vim field is absent (vim disabled)', () => {
            const ctx = makeContext({ data: { model: { id: 'claude-sonnet-4-5' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when context.data is absent', () => {
            const ctx = makeContext();
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns vim icon + N in preview mode regardless of data', () => {
            const ctx = makeContext({ isPreview: true });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('\uE62B-N');
        });

        it('returns vim icon + first character of unknown mode string', () => {
            const ctx = makeContext({ data: { vim: { mode: 'COMMAND' } } });
            expect(new VimModeWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('\uE62B-C');
        });
    });
});