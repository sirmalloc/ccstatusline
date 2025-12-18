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
import { ThinkingModeWidget } from '../ThinkingMode';

function render(thinkingEnabled: boolean | undefined, rawValue = false, isPreview = false) {
    const widget = new ThinkingModeWidget();
    const context: RenderContext = {
        data: thinkingEnabled !== undefined
            ? { thinking: { enabled: thinkingEnabled } }
            : undefined,
        isPreview
    };
    const item: WidgetItem = {
        id: 'thinking-mode',
        type: 'thinking-mode',
        rawValue
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ThinkingModeWidget', () => {
    describe('with thinking enabled', () => {
        it('should render "Thinking: Enabled" when thinking is enabled', () => {
            const result = render(true);
            expect(result).toBe('Thinking: Enabled');
        });

        it('should render "Enabled" in raw value mode when thinking is enabled', () => {
            const result = render(true, true);
            expect(result).toBe('Enabled');
        });
    });

    describe('with thinking disabled', () => {
        it('should render "Thinking: Disabled" when thinking is disabled', () => {
            const result = render(false);
            expect(result).toBe('Thinking: Disabled');
        });

        it('should render "Disabled" in raw value mode when thinking is disabled', () => {
            const result = render(false, true);
            expect(result).toBe('Disabled');
        });
    });

    describe('when thinking data is not available', () => {
        it('should return null when thinking data is undefined', () => {
            const result = render(undefined);
            expect(result).toBeNull();
        });
    });

    describe('preview mode', () => {
        it('should render "Thinking: Enabled" in preview mode', () => {
            const result = render(undefined, false, true);
            expect(result).toBe('Thinking: Enabled');
        });

        it('should render "Enabled" in raw value preview mode', () => {
            const result = render(undefined, true, true);
            expect(result).toBe('Enabled');
        });
    });

    describe('widget properties', () => {
        it('should have correct default color', () => {
            const widget = new ThinkingModeWidget();
            expect(widget.getDefaultColor()).toBe('magenta');
        });

        it('should have correct display name', () => {
            const widget = new ThinkingModeWidget();
            expect(widget.getDisplayName()).toBe('Thinking Mode');
        });

        it('should have correct description', () => {
            const widget = new ThinkingModeWidget();
            expect(widget.getDescription()).toBe('Shows whether extended thinking is enabled or disabled');
        });

        it('should support raw value mode', () => {
            const widget = new ThinkingModeWidget();
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('should support colors', () => {
            const widget = new ThinkingModeWidget();
            const item: WidgetItem = { id: 'test', type: 'thinking-mode' };
            expect(widget.supportsColors(item)).toBe(true);
        });
    });
});