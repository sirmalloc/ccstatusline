import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
// Statically load renderer first so the eager widget registry initializes before
// any widget module is dynamically imported (avoids a circular-import init order).
import '../../utils/renderer';

async function loadWidgets() {
    const [{ TokensInputWidget }, { TokensTotalWidget }] = await Promise.all([
        import('../TokensInput'),
        import('../TokensTotal')
    ]);
    return { TokensInputWidget, TokensTotalWidget };
}

const settings = {} as Settings;

function item(metadata?: Record<string, string>, rawValue?: boolean): WidgetItem {
    return { id: '1', type: 'tokens-input', metadata, rawValue };
}

const baseMetrics = {
    inputTokens: 90000, outputTokens: 40000, cachedTokens: 22000,
    totalTokens: 152000, contextLength: 50000
};
const sessionMetrics = {
    inputTokens: 150000, outputTokens: 60000, cachedTokens: 30000,
    totalTokens: 240000, contextLength: 50000
};

function ctx(over: Partial<RenderContext> = {}): RenderContext {
    return {
        tokenMetrics: baseMetrics,
        sessionTokenMetrics: sessionMetrics,
        ...over
    };
}

describe('token widgets — subagents toggle', () => {
    it('TokensInput uses main metrics and no marker when disabled', async () => {
        const { TokensInputWidget } = await loadWidgets();
        const w = new TokensInputWidget();
        expect(w.render(item(), ctx(), settings)).toBe('In: 90.0k');
    });

    it('TokensInput uses session metrics and Σ marker when enabled', async () => {
        const { TokensInputWidget } = await loadWidgets();
        const w = new TokensInputWidget();
        const out = w.render(item({ includeSubagents: 'true' }), ctx(), settings);
        expect(out).toBe('Σ In: 150.0k');
    });

    it('TokensInput omits the marker in raw mode but still uses session metrics', async () => {
        const { TokensInputWidget } = await loadWidgets();
        const w = new TokensInputWidget();
        const out = w.render(item({ includeSubagents: 'true' }, true), ctx(), settings);
        expect(out).toBe('150.0k');
    });

    it('TokensInput ignores the stdin context_window total when subagents are on', async () => {
        const { TokensInputWidget } = await loadWidgets();
        const w = new TokensInputWidget();
        const out = w.render(
            item({ includeSubagents: 'true' }),
            ctx({ data: { context_window: { total_input_tokens: 12345 } } }),
            settings
        );
        // Must come from sessionTokenMetrics (150.0k), not the 12345 payload value.
        expect(out).toBe('Σ In: 150.0k');
    });

    it('TokensTotal switches to session total with marker when enabled', async () => {
        const { TokensTotalWidget } = await loadWidgets();
        const w = new TokensTotalWidget();
        expect(w.render(item(), ctx(), settings)).toBe('Total: 152.0k');
        expect(w.render(item({ includeSubagents: 'true' }), ctx(), settings)).toBe('Σ Total: 240.0k');
    });

    it('toggles the flag through handleEditorAction', async () => {
        const { TokensTotalWidget } = await loadWidgets();
        const w = new TokensTotalWidget();
        const on = w.handleEditorAction('toggle-subagents', item());
        expect(on?.metadata?.includeSubagents).toBe('true');
        const off = w.handleEditorAction('toggle-subagents', on ?? item());
        expect(off?.metadata?.includeSubagents).toBeUndefined();
    });

    it('reports the [+sub] modifier in the editor display when enabled', async () => {
        const { TokensTotalWidget } = await loadWidgets();
        const w = new TokensTotalWidget();
        expect(w.getEditorDisplay(item()).modifierText).toBeUndefined();
        expect(w.getEditorDisplay(item({ includeSubagents: 'true' })).modifierText).toBe('[+sub]');
    });
});
