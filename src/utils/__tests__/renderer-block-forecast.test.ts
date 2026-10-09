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
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

const plainSettings: Settings = { ...DEFAULT_SETTINGS, colorLevel: 0, defaultSeparator: '|', powerline: { ...DEFAULT_SETTINGS.powerline } };
const powerlineSettings: Settings = { ...DEFAULT_SETTINGS, colorLevel: 0, powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, separators: ['|'] } };

function renderLine(widgets: WidgetItem[], settings: Settings, context: RenderContext): string {
    const [preRendered = []] = preRenderAllWidgets([widgets], settings, context);
    return stripSgrCodes(renderStatusLine(widgets, settings, context, preRendered, []));
}

const usage: WidgetItem = { id: 'usage', type: 'session-usage' };
const forecast: WidgetItem = { id: 'forecast', type: 'block-forecast' };
const model: WidgetItem = { id: 'model', type: 'model' };
const context: RenderContext = {
    isPreview: false,
    terminalWidth: 200,
    usageData: { sessionUsage: 42 },
    data: { model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' } }
};

describe('Block Forecast between Session Usage and another widget', () => {
    it.each([
        ['plain', plainSettings],
        ['Powerline', powerlineSettings]
    ])('leaves the %s line as if it were not there while hidden', (_mode, settings) => {
        expect(renderLine([usage, forecast, model], settings, context)).toBe(renderLine([usage, model], settings, context));
    });

    it.each([
        ['plain', plainSettings],
        ['Powerline', powerlineSettings]
    ])('takes its own place on the %s line once shown', (_mode, settings) => {
        const line = renderLine([usage, forecast, model], settings, { ...context, sessionForecast: { projectedPercent: 83.2, limitInMs: null } });

        expect(line).toMatch(/Session: 42\.0%.*→83\.2%.*Opus 5\.5/);
    });
});
