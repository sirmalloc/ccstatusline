import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { calculateContextPercentageMetrics } from '../../utils/context-percentage';
import { getWidget } from '../../utils/widgets';

function renderContextWidgets(context: RenderContext, inverse = false) {
    const metadata = { inverse: String(inverse) };
    return {
        window: getWidget('context-window')?.render({ id: 'window', type: 'context-window' }, context, DEFAULT_SETTINGS),
        bar: getWidget('context-bar')?.render({ id: 'bar', type: 'context-bar' }, context, DEFAULT_SETTINGS),
        percentage: getWidget('context-percentage')?.render({ id: 'percent', type: 'context-percentage', metadata }, context, DEFAULT_SETTINGS),
        usable: getWidget('context-percentage-usable')?.render({ id: 'usable', type: 'context-percentage-usable', metadata }, context, DEFAULT_SETTINGS)
    };
}

const transcriptMetrics = {
    inputTokens: 100000,
    outputTokens: 0,
    cachedTokens: 0,
    totalTokens: 100000,
    contextLength: 100000
};

const scenarios: { name: string; context: RenderContext }[] = [
    {
        name: 'current input usage with an incorrect reported window',
        context: {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: { input_tokens: 100000 }
                }
            }
        }
    },
    {
        name: 'current usage with a reported percentage and stale transcript metrics',
        context: {
            data: {
                context_window: {
                    context_window_size: 200000,
                    used_percentage: 50,
                    current_usage: {
                        input_tokens: 60000,
                        cache_creation_input_tokens: 10000,
                        cache_read_input_tokens: 30000,
                        output_tokens: 20000
                    }
                }
            },
            tokenMetrics: { ...transcriptMetrics, contextLength: 150000 }
        }
    },
    {
        name: 'token counts inferred from a reported percentage and window',
        context: { data: { context_window: { context_window_size: 200000, used_percentage: 50 } } }
    },
    {
        name: 'numeric current usage without a reported window',
        context: { data: { context_window: { current_usage: 100000, used_percentage: 50 } } }
    },
    {
        name: 'transcript usage with an incorrect reported window',
        context: {
            data: { context_window: { context_window_size: 200000 } },
            tokenMetrics: transcriptMetrics
        }
    },
    {
        name: 'transcript usage when only a reported percentage is available',
        context: {
            data: { context_window: { used_percentage: 50 } },
            tokenMetrics: transcriptMetrics
        }
    }
];

describe('context window override across widgets', () => {
    const originalOverride = process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE;

    beforeEach(() => {
        process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1M';
    });

    afterEach(() => {
        if (originalOverride === undefined) {
            delete process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE;
        } else {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = originalOverride;
        }
    });

    it.each(scenarios)('uses the effective window for $name', ({ context }) => {
        const { bar, ...values } = renderContextWidgets(context);
        expect(bar).toContain('100k/1.0M (10%)');
        expect(values).toEqual({
            window: 'Win: 1.0M',
            percentage: 'Ctx Used: 10.0%',
            usable: 'Ctx(u) Used: 12.5%'
        });
        expect(calculateContextPercentageMetrics(context)).toEqual({ usedPercentage: 10, windowSize: 1000000 });
    });

    it('calculates remaining percentages from the effective window', () => {
        const context: RenderContext = { data: { context_window: { context_window_size: 200000, current_usage: 100000, used_percentage: 50 } } };
        const rendered = renderContextWidgets(context, true);
        expect(rendered.percentage).toBe('Ctx Left: 90.0%');
        expect(rendered.usable).toBe('Ctx(u) Left: 87.5%');
    });

    it('caps percentages when usage exceeds the effective window', () => {
        process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '50k';
        const context: RenderContext = { data: { context_window: { context_window_size: 200000, current_usage: 100000, used_percentage: 50 } } };
        const { bar, ...values } = renderContextWidgets(context);
        expect(bar).toContain('100k/50k (100%)');
        expect(values).toEqual({
            window: 'Win: 50.0k',
            percentage: 'Ctx Used: 100.0%',
            usable: 'Ctx(u) Used: 100.0%'
        });
    });

    it('does not reinterpret a percentage without a known token count or reported window', () => {
        const context: RenderContext = { data: { context_window: { used_percentage: 50 } } };
        expect(renderContextWidgets(context)).toEqual({ window: 'Win: 1.0M', bar: null, percentage: null, usable: null });
    });

    it.each([undefined, 'invalid'])('preserves reported values when the override is %s', (override) => {
        if (override === undefined) {
            delete process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE;
        } else {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = override;
        }
        const context: RenderContext = { data: { context_window: { context_window_size: 200000, current_usage: 100000, used_percentage: 49 } } };
        const { bar, ...values } = renderContextWidgets(context);
        expect(bar).toContain('100k/200k (50%)');
        expect(values).toEqual({
            window: 'Win: 200.0k',
            percentage: 'Ctx Used: 49.0%',
            usable: 'Ctx(u) Used: 62.5%'
        });
    });
});
