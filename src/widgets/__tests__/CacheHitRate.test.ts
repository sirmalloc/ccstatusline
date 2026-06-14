import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { CacheHitRateWidget } from '../CacheHitRate';

const widget = new CacheHitRateWidget();
const item = { id: 'chr', type: 'cache-hit-rate' } as const;

describe('CacheHitRateWidget', () => {
    it('returns null when no tokenMetrics', () => {
        expect(widget.render(item, {}, DEFAULT_SETTINGS)).toBeNull();
    });

    it('returns null when denominator is zero', () => {
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                totalTokens: 0,
                contextLength: 0
            }
        };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBeNull();
    });

    it('returns 100% when only cache reads', () => {
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 50,
                cachedTokens: 1000,
                cacheReadTokens: 1000,
                cacheCreationTokens: 0,
                totalTokens: 1050,
                contextLength: 1000
            }
        };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Cache: 100%');
    });

    it('returns 0% when no cache reads', () => {
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 500,
                outputTokens: 100,
                cachedTokens: 200,
                cacheReadTokens: 0,
                cacheCreationTokens: 200,
                totalTokens: 800,
                contextLength: 700
            }
        };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Cache: 0%');
    });

    it('computes rounded percentage from read/creation/input mix', () => {
        // 700 / (700 + 200 + 100) = 70%
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 100,
                outputTokens: 50,
                cachedTokens: 900,
                cacheReadTokens: 700,
                cacheCreationTokens: 200,
                totalTokens: 1050,
                contextLength: 1000
            }
        };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Cache: 70%');
    });

    it('treats missing cache fields as 0', () => {
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 500,
                outputTokens: 100,
                cachedTokens: 0,
                totalTokens: 600,
                contextLength: 500
            }
        };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Cache: 0%');
    });

    it('returns raw value without label', () => {
        const context: RenderContext = {
            tokenMetrics: {
                inputTokens: 100,
                outputTokens: 0,
                cachedTokens: 900,
                cacheReadTokens: 700,
                cacheCreationTokens: 200,
                totalTokens: 1000,
                contextLength: 1000
            }
        };
        expect(widget.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS)).toBe('70%');
    });

    it('renders preview', () => {
        const context: RenderContext = { isPreview: true };
        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Cache: 87%');
        expect(widget.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS)).toBe('87%');
    });
});
