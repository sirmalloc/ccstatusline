import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import * as renderer from '../../utils/renderer';

async function loadWidgets() {
    const [
        { CacheHitRateWidget },
        { CacheReadWidget },
        { CacheWriteWidget }
    ] = await Promise.all([
        import('../CacheHitRate'),
        import('../CacheRead'),
        import('../CacheWrite')
    ]);

    return {
        CacheHitRateWidget,
        CacheReadWidget,
        CacheWriteWidget
    };
}

const turnItem = (type: string, extra: Partial<WidgetItem> = {}): WidgetItem => ({ id: type, type, ...extra });
const sessionItem = (type: string, extra: Partial<WidgetItem> = {}): WidgetItem => ({
    id: type,
    type,
    metadata: { cacheScopeSession: 'true' },
    ...extra
});

describe('Cache widgets', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(renderer, 'formatTokens').mockImplementation((value: number) => `fmt:${value}`);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders turn-scope values from context_window.current_usage by default', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    current_usage: {
                        input_tokens: 500,
                        output_tokens: 100,
                        cache_creation_input_tokens: 2000,
                        cache_read_input_tokens: 8000
                    }
                }
            }
        };

        // context = 500 + 8000 + 2000 = 10500
        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate'), context, DEFAULT_SETTINGS)).toBe('Cache Hit: 80.0%');
        expect(new w.CacheReadWidget().render(turnItem('cache-read'), context, DEFAULT_SETTINGS)).toBe('Cache Read: fmt:8000 (76.2%)');
        expect(new w.CacheWriteWidget().render(turnItem('cache-write'), context, DEFAULT_SETTINGS)).toBe('Cache Write: fmt:2000 (19.0%)');
    });

    it('renders session-scope values from tokenMetrics when the scope flag is set', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    current_usage: {
                        input_tokens: 500,
                        output_tokens: 100,
                        cache_creation_input_tokens: 2000,
                        cache_read_input_tokens: 8000
                    }
                }
            },
            tokenMetrics: {
                inputTokens: 1000,
                outputTokens: 200,
                cachedTokens: 10000,
                cacheReadTokens: 6000,
                cacheCreationTokens: 4000,
                totalTokens: 11200,
                contextLength: 11000
            }
        };

        // session context = 1000 + 6000 + 4000 = 11000
        expect(new w.CacheHitRateWidget().render(sessionItem('cache-hit-rate'), context, DEFAULT_SETTINGS)).toBe('Cache Hit: 60.0%');
        expect(new w.CacheReadWidget().render(sessionItem('cache-read'), context, DEFAULT_SETTINGS)).toBe('Cache Read: fmt:6000 (54.5%)');
        expect(new w.CacheWriteWidget().render(sessionItem('cache-write'), context, DEFAULT_SETTINGS)).toBe('Cache Write: fmt:4000 (36.4%)');
    });

    it('renders raw values without labels', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    current_usage: {
                        input_tokens: 500,
                        cache_creation_input_tokens: 2000,
                        cache_read_input_tokens: 8000
                    }
                }
            }
        };

        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('80.0%');
        expect(new w.CacheReadWidget().render(turnItem('cache-read', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('fmt:8000 (76.2%)');
        expect(new w.CacheWriteWidget().render(turnItem('cache-write', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('fmt:2000 (19.0%)');
    });

    it('renders n/a when the turn data source is missing by default', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {};

        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate'), context, DEFAULT_SETTINGS)).toBe('Cache Hit: n/a');
        expect(new w.CacheReadWidget().render(turnItem('cache-read'), context, DEFAULT_SETTINGS)).toBe('Cache Read: n/a');
        expect(new w.CacheWriteWidget().render(turnItem('cache-write'), context, DEFAULT_SETTINGS)).toBe('Cache Write: n/a');
        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('n/a');
    });

    it('hides missing turn data when hide-when-empty is enabled', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {};
        const hidden = { metadata: { hideWhenEmpty: 'true' } };

        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate', hidden), context, DEFAULT_SETTINGS)).toBeNull();
        expect(new w.CacheReadWidget().render(turnItem('cache-read', hidden), context, DEFAULT_SETTINGS)).toBeNull();
        expect(new w.CacheWriteWidget().render(turnItem('cache-write', hidden), context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('renders zero cache values by default', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    current_usage: {
                        input_tokens: 0,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };

        // Token widgets drop percentages when there is no prompt-context denominator.
        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate'), context, DEFAULT_SETTINGS)).toBe('Cache Hit: 0.0%');
        expect(new w.CacheReadWidget().render(turnItem('cache-read'), context, DEFAULT_SETTINGS)).toBe('Cache Read: fmt:0');
        expect(new w.CacheWriteWidget().render(turnItem('cache-write'), context, DEFAULT_SETTINGS)).toBe('Cache Write: fmt:0');
    });

    it('hides zero cache values when hide-when-empty is enabled', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    current_usage: {
                        input_tokens: 0,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };
        const hidden = { metadata: { hideWhenEmpty: 'true' } };

        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate', hidden), context, DEFAULT_SETTINGS)).toBeNull();
        expect(new w.CacheReadWidget().render(turnItem('cache-read', hidden), context, DEFAULT_SETTINGS)).toBeNull();
        expect(new w.CacheWriteWidget().render(turnItem('cache-write', hidden), context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('hides per-widget zero values when hide-when-empty is enabled', async () => {
        const w = await loadWidgets();
        const context: RenderContext = {
            data: {
                context_window: {
                    current_usage: {
                        input_tokens: 500,
                        cache_creation_input_tokens: 2000,
                        cache_read_input_tokens: 0
                    }
                }
            }
        };
        const hidden = { metadata: { hideWhenEmpty: 'true' } };

        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate', hidden), context, DEFAULT_SETTINGS)).toBeNull();
        expect(new w.CacheReadWidget().render(turnItem('cache-read', hidden), context, DEFAULT_SETTINGS)).toBeNull();
        expect(new w.CacheWriteWidget().render(turnItem('cache-write', hidden), context, DEFAULT_SETTINGS)).toBe('Cache Write: fmt:2000 (80.0%)');
    });

    it('toggles cache options via custom keybind actions', async () => {
        const w = await loadWidgets();
        const widget = new w.CacheHitRateWidget();
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 't', label: '(t)urn/session', action: 'toggle-cache-scope' },
            { key: 'h', label: '(h)ide when empty', action: 'toggle-hide-empty' }
        ]);

        const toggled = widget.handleEditorAction('toggle-cache-scope', turnItem('cache-hit-rate'));
        expect(toggled?.metadata?.cacheScopeSession).toBe('true');

        const hidden = widget.handleEditorAction('toggle-hide-empty', turnItem('cache-hit-rate'));
        expect(hidden?.metadata?.hideWhenEmpty).toBe('true');
        expect(widget.getEditorDisplay(hidden ?? turnItem('cache-hit-rate')).modifierText).toBe('(hide when empty)');

        const sessionHidden = sessionItem('cache-hit-rate', { metadata: { cacheScopeSession: 'true', hideWhenEmpty: 'true' } });
        expect(widget.getEditorDisplay(sessionHidden).modifierText).toBe('(session, hide when empty)');
    });

    it('renders preview labels and raw values', async () => {
        const w = await loadWidgets();
        const context: RenderContext = { isPreview: true };

        expect(new w.CacheHitRateWidget().render(turnItem('cache-hit-rate'), context, DEFAULT_SETTINGS)).toBe('Cache Hit: 87.0%');
        expect(new w.CacheReadWidget().render(turnItem('cache-read', { rawValue: true }), context, DEFAULT_SETTINGS)).toBe('12k (64.0%)');
        expect(new w.CacheWriteWidget().render(turnItem('cache-write'), context, DEFAULT_SETTINGS)).toBe('Cache Write: 3k (16.0%)');
    });
});
