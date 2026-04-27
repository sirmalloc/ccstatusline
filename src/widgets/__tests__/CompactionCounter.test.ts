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

function render(options: {
    isPreview?: boolean;
    compactionData?: { count: number } | null;
} = {}) {
    const widget = new CompactionCounterWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        compactionData: options.compactionData
    };
    return widget.render(ITEM, context, DEFAULT_SETTINGS);
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
            expect(render({ compactionData: { count: 3 } })).toBe('↻3');
        });

        it('renders count of 1', () => {
            expect(render({ compactionData: { count: 1 } })).toBe('↻1');
        });

        it('returns null when count is 0', () => {
            expect(render({ compactionData: { count: 0 } })).toBeNull();
        });

        it('returns null when compactionData is undefined', () => {
            expect(render()).toBeNull();
        });

        it('returns null when compactionData is null', () => {
            expect(render({ compactionData: null })).toBeNull();
        });

        it('returns null when context.data is absent', () => {
            expect(render()).toBeNull();
        });

        it('returns sample data in preview mode', () => {
            expect(render({ isPreview: true })).toBe('↻2');
        });
    });

    describe('editor', () => {
        it('has correct editor display', () => {
            expect(new CompactionCounterWidget().getEditorDisplay(ITEM)).toEqual({ displayText: 'Compaction Counter' });
        });
    });
});
