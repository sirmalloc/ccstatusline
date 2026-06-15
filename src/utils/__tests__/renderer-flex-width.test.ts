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
import {
    getVisibleWidth,
    stripSgrCodes
} from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    countPowerlineStartCapSlots,
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

describe('flex-separator widget', () => {
    const leftWidget: WidgetItem = {
        id: 'left',
        type: 'custom-text',
        customText: 'LEFT',
        backgroundColor: 'bgBlue',
        color: 'white'
    };
    const rightWidget: WidgetItem = {
        id: 'right',
        type: 'custom-text',
        customText: 'RIGHT',
        backgroundColor: 'bgGreen',
        color: 'white'
    };
    const flexWidget: WidgetItem = { id: 'flex', type: 'flex-separator' };

    it('keeps the flex position between visible widgets when a preceding widget renders empty', () => {
        const hiddenWidget: WidgetItem = {
            id: 'hidden',
            type: 'custom-text',
            customText: '',
            backgroundColor: 'bgRed',
            color: 'white'
        };
        const line = renderLine([leftWidget, hiddenWidget, flexWidget, rightWidget], {
            flexMode: 'full',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true
            }
        }, { terminalWidth: 50 });
        const plainLine = stripSgrCodes(line);

        expect(getVisibleWidth(line)).toBe(50 - 6);
        expect(plainLine.endsWith('RIGHT')).toBe(true);
        expect(plainLine).not.toMatch(/RIGHT\s+$/);
    });

    it('distributes remaining width across a flex-separator in powerline mode', () => {
        const line = renderLine([leftWidget, flexWidget, rightWidget], {
            flexMode: 'full',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true
            }
        }, { terminalWidth: 50 });

        // flexMode 'full' reserves 6 columns for trailing UI, so the effective
        // render width is terminalWidth - 6.
        expect(getVisibleWidth(line)).toBe(50 - 6);
    });

    it('distributes space across multiple flex-separators in powerline mode', () => {
        const middleWidget: WidgetItem = {
            id: 'middle',
            type: 'custom-text',
            customText: 'MID',
            backgroundColor: 'bgYellow',
            color: 'black'
        };
        const line = renderLine([leftWidget, flexWidget, middleWidget, flexWidget, rightWidget], {
            flexMode: 'full',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true
            }
        }, { terminalWidth: 60 });

        expect(getVisibleWidth(line)).toBe(60 - 6);
    });

    it('uses the next configured start cap for each segment after a flex-separator', () => {
        const middleWidget: WidgetItem = {
            id: 'middle',
            type: 'custom-text',
            customText: 'MID',
            backgroundColor: 'bgYellow',
            color: 'black'
        };
        const line = renderLine([leftWidget, flexWidget, middleWidget, flexWidget, rightWidget], {
            flexMode: 'full',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                startCaps: ['\uE0B2', '\uE0B6', '\uE0BA']
            }
        }, { terminalWidth: 60 });
        const plainLine = stripSgrCodes(line);

        const firstCapIndex = plainLine.indexOf('\uE0B2');
        const leftIndex = plainLine.indexOf('LEFT');
        const secondCapIndex = plainLine.indexOf('\uE0B6');
        const middleIndex = plainLine.indexOf('MID');
        const thirdCapIndex = plainLine.indexOf('\uE0BA');
        const rightIndex = plainLine.indexOf('RIGHT');

        expect(getVisibleWidth(line)).toBe(60 - 6);
        expect(firstCapIndex).toBeGreaterThanOrEqual(0);
        expect(firstCapIndex).toBeLessThan(leftIndex);
        expect(secondCapIndex).toBeGreaterThan(leftIndex);
        expect(secondCapIndex).toBeLessThan(middleIndex);
        expect(thirdCapIndex).toBeGreaterThan(middleIndex);
        expect(thirdCapIndex).toBeLessThan(rightIndex);
    });

    it('continues start cap selection across lines after flex-created segments', () => {
        const settings = createSettings({
            flexMode: 'full',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                startCaps: ['\uE0B2', '\uE0B6', '\uE0BA']
            }
        });
        const firstLineWidgets = [leftWidget, flexWidget, rightWidget];
        const secondLineWidgets: WidgetItem[] = [{
            id: 'second-line',
            type: 'custom-text',
            customText: 'SECOND',
            backgroundColor: 'bgYellow',
            color: 'black'
        }];
        const context: RenderContext = {
            isPreview: false,
            terminalWidth: 50,
            globalPowerlineStartCapIndex: 0
        };
        const preRenderedLines = preRenderAllWidgets([firstLineWidgets, secondLineWidgets], settings, context);
        const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
        const firstPreRenderedWidgets = preRenderedLines[0] ?? [];
        const secondPreRenderedWidgets = preRenderedLines[1] ?? [];
        const firstLine = renderStatusLine(
            firstLineWidgets,
            settings,
            context,
            firstPreRenderedWidgets,
            preCalculatedMaxWidths
        );
        const nextStartCapIndex = countPowerlineStartCapSlots(firstLineWidgets, firstPreRenderedWidgets);
        const secondLine = renderStatusLine(
            secondLineWidgets,
            settings,
            {
                ...context,
                lineIndex: 1,
                globalPowerlineStartCapIndex: nextStartCapIndex
            },
            secondPreRenderedWidgets,
            preCalculatedMaxWidths
        );
        const firstPlainLine = stripSgrCodes(firstLine);
        const secondPlainLine = stripSgrCodes(secondLine);

        expect(firstPlainLine.indexOf('\uE0B2')).toBeLessThan(firstPlainLine.indexOf('LEFT'));
        expect(firstPlainLine.indexOf('\uE0B6')).toBeLessThan(firstPlainLine.indexOf('RIGHT'));
        expect(nextStartCapIndex).toBe(2);
        expect(secondPlainLine.indexOf('\uE0BA')).toBeLessThan(secondPlainLine.indexOf('SECOND'));
        expect(secondPlainLine).not.toContain('\uE0B6');
    });

    it('reserves end cap width before distributing flex space in powerline mode', () => {
        const line = renderLine([leftWidget, flexWidget, rightWidget], {
            flexMode: 'full',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                endCaps: ['\uE0B0']
            }
        }, { terminalWidth: 50 });
        const plainLine = stripSgrCodes(line);

        expect(getVisibleWidth(line)).toBe(50 - 6);
        expect(plainLine.endsWith('\uE0B0')).toBe(true);
        expect(line).not.toContain('...');
    });

    it('strips flex-separator markers when terminal width is unknown', () => {
        const line = renderLine([leftWidget, flexWidget, rightWidget], {
            flexMode: 'full',
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true
            }
        }, { terminalWidth: undefined });

        // No marker characters should leak into the output.
        expect(line).not.toContain('FLEX');
        expect(line).not.toContain('\x01');
    });

    it('still works in non-powerline mode (no regression)', () => {
        const line = renderLine([leftWidget, flexWidget, rightWidget], {
            flexMode: 'full',
            powerline: { ...DEFAULT_SETTINGS.powerline, enabled: false }
        }, { terminalWidth: 50 });

        expect(getVisibleWidth(line)).toBe(50 - 6);
    });
});
