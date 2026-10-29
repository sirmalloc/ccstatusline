import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as usage from '../../utils/usage';
import { SpendLimitUsageWidget } from '../SpendLimitUsage';

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new SpendLimitUsageWidget().render(item, context, DEFAULT_SETTINGS);
}

const baseItem: WidgetItem = { id: 'spend', type: 'spend-limit-usage' };
const usageContext: RenderContext = { usageData: { spendLimitUsage: 62.8 } };

describe('SpendLimitUsageWidget', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('describes itself', () => {
        const widget = new SpendLimitUsageWidget();

        expect(widget.getDisplayName()).toBe('Spend Limit Usage');
        expect(widget.getCategory()).toBe('Usage');
        expect(widget.getLabelPrefix()).toBe('Spend Limit: ');
        expect(widget.supportsRawValue()).toBe(true);
    });

    it('renders the used percentage with a label', () => {
        expect(render(baseItem, usageContext)).toBe('Spend Limit: 62.8%');
    });

    it('renders raw and inverted values', () => {
        expect(render({ ...baseItem, rawValue: true }, usageContext)).toBe('62.8%');
        expect(render({ ...baseItem, metadata: { invert: 'true' } }, usageContext)).toBe('Spend Limit: 37.2%');
    });

    it('renders the bar display modes', () => {
        expect(render({ ...baseItem, metadata: { display: 'progress' } }, usageContext))
            .toBe('Spend Limit: [████████████████████░░░░░░░░░░░░] 62.8%');
        expect(render({ ...baseItem, metadata: { display: 'slider' } }, usageContext))
            .toBe('Spend Limit: ▓▓▓▓▓▓░░░░ 62.8%');
    });

    it('caps the percentage at 100 once the limit is exceeded', () => {
        expect(render(baseItem, { usageData: { spendLimitUsage: 112.4 } })).toBe('Spend Limit: 100.0%');
    });

    it('renders zero usage', () => {
        expect(render(baseItem, { usageData: { spendLimitUsage: 0 } })).toBe('Spend Limit: 0.0%');
    });

    it('renders nothing when the payload has no spend limit', () => {
        expect(render(baseItem, {})).toBeNull();
        expect(render(baseItem, { usageData: { sessionUsage: 20 } })).toBeNull();
    });

    it('ignores usage API errors because the value never comes from the API', () => {
        const errorMessage = vi.spyOn(usage, 'getUsageErrorMessage');

        expect(render(baseItem, { usageData: { error: 'timeout' } })).toBeNull();
        expect(render(baseItem, { usageData: { spendLimitUsage: 62.8, error: 'timeout' } })).toBe('Spend Limit: 62.8%');
        expect(errorMessage).not.toHaveBeenCalled();
    });

    it('renders a preview', () => {
        expect(render(baseItem, { isPreview: true })).toBe('Spend Limit: 40.0%');
    });

    it('offers no time cursor because the payload carries no window length', () => {
        const keybinds = new SpendLimitUsageWidget().getCustomKeybinds(baseItem);

        expect(keybinds.map(keybind => keybind.action)).toEqual(['toggle-progress', 'toggle-invert']);
    });
});
