import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getVisibleWidth } from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function renderLine(
    widgets: WidgetItem[],
    settingsOverrides: Partial<Settings>,
    contextOverrides: Partial<RenderContext> = {}
): string {
    const settings = createSettings(settingsOverrides);
    const context: RenderContext = {
        isPreview: false,
        terminalWidth: 50,
        ...contextOverrides
    };

    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    const preRenderedWidgets = preRenderedLines[0] ?? [];

    return renderStatusLine(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
}

describe('renderer flex width behavior', () => {
    const longTextWidget: WidgetItem = {
        id: 'text',
        type: 'custom-text',
        customText: 'abcdefghijklmnopqrstuvwxyz1234567890'
    };

    it('uses full-minus-40 width in normal mode', () => {
        const line = renderLine([longTextWidget], { flexMode: 'full-minus-40' });

        expect(getVisibleWidth(line)).toBe(10);
        expect(line.endsWith('...')).toBe(true);
    });

    it('uses full width in full-until-compact when under threshold', () => {
        const line = renderLine([longTextWidget], {
            flexMode: 'full-until-compact',
            compactThreshold: 60
        }, { data: { context_window: { used_percentage: 20 } } });

        expect(getVisibleWidth(line)).toBe(longTextWidget.customText?.length);
        expect(line.endsWith('...')).toBe(false);
    });

    it('uses compact width in full-until-compact when above threshold', () => {
        const line = renderLine([longTextWidget], {
            flexMode: 'full-until-compact',
            compactThreshold: 60
        }, { data: { context_window: { used_percentage: 80 } } });

        expect(getVisibleWidth(line)).toBe(10);
        expect(line.endsWith('...')).toBe(true);
    });

    it('always uses full preview width in full-until-compact preview mode', () => {
        const line = renderLine([longTextWidget], {
            flexMode: 'full-until-compact',
            compactThreshold: 60
        }, {
            isPreview: true,
            data: { context_window: { used_percentage: 99 } }
        });

        expect(getVisibleWidth(line)).toBe(longTextWidget.customText?.length);
        expect(line.endsWith('...')).toBe(false);
    });

    it('applies the same width behavior in powerline mode', () => {
        const line = renderLine([{
            ...longTextWidget,
            backgroundColor: 'bgBlue',
            color: 'white'
        }], {
            flexMode: 'full-minus-40',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true
            }
        });

        expect(getVisibleWidth(line)).toBe(10);
        expect(line.endsWith('...')).toBe(true);
    });
});
