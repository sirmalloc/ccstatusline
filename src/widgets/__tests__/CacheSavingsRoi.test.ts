import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { CacheReadRateWidget } from '../CacheReadRate';
import { CacheRoiWidget } from '../CacheRoi';
import { CacheSavingsWidget } from '../CacheSavings';

const sessionItem = (type: string, rawValue = false): WidgetItem => ({
    id: type,
    type,
    rawValue,
    metadata: { cacheScopeSession: 'true' }
});

const sessionContext = (model: string): RenderContext => ({
    data: { model },
    tokenMetrics: {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 2_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
        totalTokens: 2_000_000,
        contextLength: 0
    }
});

describe('prompt cache savings and ROI widgets', () => {
    it('estimates net savings using model rates and 5-minute cache writes', () => {
        const savings = new CacheSavingsWidget();
        expect(savings.render(
            sessionItem('cache-savings'),
            sessionContext('claude-sonnet-4-5-20250929'),
            DEFAULT_SETTINGS
        )).toBe('Saved: $1.95');
    });

    it('returns n/a rather than guessing for unknown models', () => {
        expect(new CacheSavingsWidget().render(
            sessionItem('cache-savings'),
            sessionContext('custom-model'),
            DEFAULT_SETTINGS
        )).toBe('Saved: n/a');
    });

    it('reports cache reads divided by cache creation and handles zero writes', () => {
        const widget = new CacheRoiWidget();
        expect(widget.render(
            sessionItem('cache-roi'),
            sessionContext('claude-sonnet-4-5-20250929'),
            DEFAULT_SETTINGS
        )).toBe('Cache ROI: 1.00x');

        const context = sessionContext('claude-sonnet-4-5-20250929');
        if (context.tokenMetrics) {
            context.tokenMetrics.cacheCreationTokens = 0;
        }
        expect(widget.render(sessionItem('cache-roi'), context, DEFAULT_SETTINGS)).toBe('Cache ROI: n/a');
    });

    it('reports cache reads as a percentage of all input tokens', () => {
        const context = sessionContext('claude-sonnet-4-5-20250929');
        if (context.tokenMetrics) {
            context.tokenMetrics.inputTokens = 1_000_000;
            context.tokenMetrics.cacheReadTokens = 2_000_000;
            context.tokenMetrics.cacheCreationTokens = 1_000_000;
        }
        expect(new CacheReadRateWidget().render(
            sessionItem('cache-read-rate'),
            context,
            DEFAULT_SETTINGS
        )).toBe('Read Rate: 50.0%');
    });

    it('prices Fable 5.1 cache reads at 0.025x and Opus 4 at the retired rate', () => {
        const savings = new CacheSavingsWidget();
        expect(savings.render(sessionItem('cache-savings'), sessionContext('claude-fable-5-1'), DEFAULT_SETTINGS))
            .toBe('Saved: $7.25');
        expect(savings.render(sessionItem('cache-savings'), sessionContext('claude-opus-4-1'), DEFAULT_SETTINGS))
            .toBe('Saved: $9.75');
    });
});
