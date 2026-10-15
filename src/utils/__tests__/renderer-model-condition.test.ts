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
import { stripSgrCodes } from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        colorLevel: 0,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function renderLine(widgets: WidgetItem[], data: Record<string, unknown> | undefined): string {
    const context: RenderContext = {
        isPreview: false,
        terminalWidth: 200,
        data
    };
    const settings = createSettings();
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    return stripSgrCodes(renderStatusLine(widgets, settings, context, preRenderedLines[0] ?? [], maxWidths));
}

const COST: Record<string, unknown> = { cost: { total_cost_usd: 2.456 } };

const WIDGETS: WidgetItem[] = [
    { id: '1', type: 'session-cost', metadata: { hideForModels: 'glm-*' } },
    { id: '2', type: 'separator', character: '|' },
    { id: '3', type: 'model', metadata: { showForModels: 'claude-*' } }
];

describe('model-conditional widget visibility', () => {
    it('hides matching widgets and collapses the separator around them', () => {
        expect(renderLine(WIDGETS, { ...COST, model: { id: 'glm-5.3-flash', display_name: 'GLM 5.3' } })).toBe('');
    });

    it('keeps widgets visible for non-matching models', () => {
        expect(renderLine(WIDGETS, { ...COST, model: { id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' } }))
            .toBe('Cost: $2.46 | Model: Claude Sonnet 4.5');
    });

    it('matches the plain-string model form case-insensitively', () => {
        expect(renderLine(WIDGETS, { ...COST, model: 'GLM-5.3-Flash' })).toBe('');
    });

    it('supports comma-separated patterns and both metadata keys together', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'session-cost', metadata: { hideForModels: 'glm-*, kimi-*' } },
            { id: '2', type: 'separator', character: '|' },
            { id: '3', type: 'model', rawValue: true }
        ];
        expect(renderLine(widgets, { ...COST, model: 'kimi-k2' })).toBe('kimi-k2');
        expect(renderLine(widgets, { ...COST, model: 'deepseek-v3' })).toBe('Cost: $2.46 | deepseek-v3');
    });

    it('shows widgets without a model payload (previews)', () => {
        const context: RenderContext = { isPreview: true };
        const settings = createSettings();
        const preRendered = preRenderAllWidgets([[{ id: '1', type: 'model', metadata: { showForModels: 'claude-*' } }]], settings, context);
        expect(preRendered[0]?.[0]?.content).toBe('Model: Claude');
    });
});
