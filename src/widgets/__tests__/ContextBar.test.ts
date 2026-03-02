import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { ContextBarWidget } from '../ContextBar';

vi.mock('../../utils/usage', () => ({ makeUsageProgressBar: vi.fn((percent: number, width = 15) => `[bar:${percent.toFixed(1)}:${width}]`) }));

describe('ContextBarWidget', () => {
    it('renders from context_window data when available', () => {
        const context: RenderContext = {
            data: {
                context_window: {
                    context_window_size: 200000,
                    current_usage: {
                        input_tokens: 20000,
                        output_tokens: 10000,
                        cache_creation_input_tokens: 5000,
                        cache_read_input_tokens: 5000
                    }
                }
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:20.0:15] 40k/200k (20%)');
    });

    it('falls back to token metrics and model context size', () => {
        const context: RenderContext = {
            data: { model: { id: 'claude-3-5-sonnet-20241022' } },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 50000
            }
        };
        const widget = new ContextBarWidget();

        expect(widget.render({ id: 'ctx', type: 'context-bar' }, context, DEFAULT_SETTINGS)).toBe('Context: [bar:25.0:15] 50k/200k (25%)');
    });
});