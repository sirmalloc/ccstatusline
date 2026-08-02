import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
// Statically load renderer first so the eager widget registry initializes before
// the widget module is dynamically imported (avoids a circular-import init order).
import '../../utils/renderer';

async function loadWidget() {
    const { SessionTotalTokensWidget } = await import('../SessionTotalTokens');
    return SessionTotalTokensWidget;
}

const settings = {} as Settings;
const sessionMetrics = {
    inputTokens: 90000, outputTokens: 40000, cachedTokens: 22000,
    totalTokens: 152000, contextLength: 50000
};

function item(metadata?: Record<string, string>, rawValue?: boolean): WidgetItem {
    return { id: '1', type: 'tokens-session-total', metadata, rawValue };
}

function ctx(over: Partial<RenderContext> = {}): RenderContext {
    return { sessionTokenMetrics: sessionMetrics, ...over };
}

describe('SessionTotalTokens widget', () => {
    it('renders the session grand total with the Σ marker', async () => {
        const SessionTotalTokensWidget = await loadWidget();
        const w = new SessionTotalTokensWidget();
        expect(w.render(item(), ctx(), settings)).toBe('Σ Total: 152.0k');
    });

    it('renders raw value without marker or label', async () => {
        const SessionTotalTokensWidget = await loadWidget();
        const w = new SessionTotalTokensWidget();
        expect(w.render(item(undefined, true), ctx(), settings)).toBe('152.0k');
    });

    it('appends a breakdown when enabled', async () => {
        const SessionTotalTokensWidget = await loadWidget();
        const w = new SessionTotalTokensWidget();
        const out = w.render(item({ breakdown: 'true' }), ctx(), settings);
        expect(out).toBe('Σ Total: 152.0k (in 90.0k/out 40.0k/cache 22.0k)');
    });

    it('returns null when session metrics are unavailable', async () => {
        const SessionTotalTokensWidget = await loadWidget();
        const w = new SessionTotalTokensWidget();
        expect(w.render(item(), ctx({ sessionTokenMetrics: null }), settings)).toBeNull();
    });

    it('toggles the breakdown flag through handleEditorAction', async () => {
        const SessionTotalTokensWidget = await loadWidget();
        const w = new SessionTotalTokensWidget();
        const on = w.handleEditorAction('toggle-breakdown', item());
        expect(on?.metadata?.breakdown).toBe('true');
        const off = w.handleEditorAction('toggle-breakdown', on ?? item());
        expect(off?.metadata?.breakdown).toBeUndefined();
    });

    it('exposes the total as its numeric value', async () => {
        const SessionTotalTokensWidget = await loadWidget();
        const w = new SessionTotalTokensWidget();
        expect(w.getNumericValue(ctx())).toBe(152000);
        expect(w.getNumericValue(ctx({ sessionTokenMetrics: null }))).toBeNull();
    });
});
