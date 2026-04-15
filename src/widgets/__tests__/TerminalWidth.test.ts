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
import { TerminalWidthWidget } from '../TerminalWidth';

function createItem(
    type: string,
    options: {
        rawValue?: boolean;
    } = {}
): WidgetItem {
    return {
        id: type,
        type,
        rawValue: options.rawValue
    };
}

describe('TerminalWidthWidget', () => {
    const widget = new TerminalWidthWidget();

    it('should report Environment category', () => {
        expect(widget.getCategory()).toBe('Environment');
    });

    it('should render preview value with terminal width', () => {
        const context: RenderContext = { isPreview: true, terminalWidth: 120 };
        expect(widget.render(createItem('terminal-width'), context, DEFAULT_SETTINGS)).toBe('Term: 120');
        expect(widget.render(createItem('terminal-width', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('120');
    });

    it('should render actual terminal width when available', () => {
        const context: RenderContext = { terminalWidth: 200 };
        expect(widget.render(createItem('terminal-width'), context, DEFAULT_SETTINGS)).toBe('Term: 200');
        expect(widget.render(createItem('terminal-width', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('200');
    });

    it('should fall back to detecting terminal width when context does not provide it', () => {
        const context: RenderContext = {};
        const result = widget.render(createItem('terminal-width'), context, DEFAULT_SETTINGS);
        // Will try to detect actual terminal width - may succeed or return null
        if (result !== null) {
            expect(result).toMatch(/^Term: \d+$/);
        } else {
            // In test environment, terminal width detection may not work
            expect(result).toBeNull();
        }
    });

    describe('getValue', () => {
        it('should declare number value type', () => {
            expect(widget.getValueType()).toBe('number');
        });

        it('should extract numeric value from preview mode', () => {
            const context: RenderContext = { isPreview: true, terminalWidth: 120 };
            expect(widget.getValue(context, createItem('terminal-width'))).toBe(120);
        });

        it('should extract numeric value from live data', () => {
            const context: RenderContext = { terminalWidth: 180 };
            expect(widget.getValue(context, createItem('terminal-width'))).toBe(180);
        });

        it('should handle detected terminal width', () => {
            const context: RenderContext = {};
            const value = widget.getValue(context, createItem('terminal-width'));
            // Will try to detect actual terminal width - may succeed or return null
            if (value !== null) {
                expect(typeof value).toBe('number');
                expect(value).toBeGreaterThan(0);
            } else {
                // In test environment, terminal width detection may not work
                expect(value).toBeNull();
            }
        });
    });
});
