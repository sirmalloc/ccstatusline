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
import { CompactionCounterWidget } from '../CompactionCounter';

const ITEM: WidgetItem = { id: 'compaction-counter', type: 'compaction-counter' };

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { ...overrides };
}

describe('CompactionCounterWidget', () => {
    describe('metadata', () => {
        it('has correct display name', () => {
            expect(new CompactionCounterWidget().getDisplayName()).toBe('Compaction Counter');
        });

        it('has correct category', () => {
            expect(new CompactionCounterWidget().getCategory()).toBe('Context');
        });

        it('does not support raw value', () => {
            expect(new CompactionCounterWidget().supportsRawValue()).toBe(false);
        });

        it('supports colors', () => {
            expect(new CompactionCounterWidget().supportsColors(ITEM)).toBe(true);
        });

        it('has correct default color', () => {
            expect(new CompactionCounterWidget().getDefaultColor()).toBe('yellow');
        });
    });

    describe('render()', () => {
        it('renders compaction count with arrow', () => {
            const ctx = makeContext({ compactionData: { count: 3 } });
            expect(new CompactionCounterWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('\u21BB3');
        });

        it('renders count of 1', () => {
            const ctx = makeContext({ compactionData: { count: 1 } });
            expect(new CompactionCounterWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('\u21BB1');
        });

        it('returns null when count is 0', () => {
            const ctx = makeContext({ compactionData: { count: 0 } });
            expect(new CompactionCounterWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when compactionData is undefined', () => {
            const ctx = makeContext();
            expect(new CompactionCounterWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when compactionData is null', () => {
            const ctx = makeContext({ compactionData: null });
            expect(new CompactionCounterWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns null when context.data is absent', () => {
            const ctx = makeContext();
            expect(new CompactionCounterWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns sample data in preview mode', () => {
            const ctx = makeContext({ isPreview: true });
            expect(new CompactionCounterWidget().render(ITEM, ctx, DEFAULT_SETTINGS)).toBe('\u21BB2');
        });
    });

    describe('editor', () => {
        it('has correct editor display', () => {
            expect(new CompactionCounterWidget().getEditorDisplay(ITEM)).toEqual({
                displayText: 'Compaction Counter'
            });
        });
    });
});
