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

const plainSettings: Settings = { ...DEFAULT_SETTINGS, colorLevel: 0, powerline: { ...DEFAULT_SETTINGS.powerline } };
const powerlineSettings: Settings = { ...plainSettings, powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, separators: ['|'] } };

function renderLine(widgets: WidgetItem[], settings: Settings, context: RenderContext): string {
    const [preRendered = []] = preRenderAllWidgets([widgets], settings, context);
    return stripSgrCodes(renderStatusLine(widgets, settings, context, preRendered, []));
}

const usage: WidgetItem = { id: 'usage', type: 'session-usage', merge: true };
const forecast: WidgetItem = { id: 'forecast', type: 'session-forecast' };
const context: RenderContext = { isPreview: false, terminalWidth: 200, usageData: { sessionUsage: 42 } };

describe('Session Forecast merged after Session Usage', () => {
    it.each([
        ['plain', plainSettings],
        ['Powerline', powerlineSettings]
    ])('leaves the %s line as Session Usage alone while hidden', (_mode, settings) => {
        expect(renderLine([usage, forecast], settings, context)).toBe(renderLine([{ ...usage, merge: undefined }], settings, context));
    });

    it.each([
        ['plain', plainSettings],
        ['Powerline', powerlineSettings]
    ])('joins Session Usage on the %s line once shown', (_mode, settings) => {
        const line = renderLine([usage, forecast], settings, { ...context, sessionForecast: { projectedPercent: 83.2, limitInMs: null } });

        expect(line).toContain('Session: 42.0%');
        expect(line).toContain('→83.2%');
    });
});
