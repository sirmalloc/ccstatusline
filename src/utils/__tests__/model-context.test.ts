import {
    describe,
    expect,
    it
} from 'vitest';

import {
    getContextConfig,
    getModelContextIdentifier
} from '../model-context';

describe('getContextConfig', () => {
    describe('Status JSON context window size override', () => {
        it('should use context_window_size as max tokens when provided', () => {
            const config = getContextConfig('claude-3-5-sonnet-20241022', 1000000);

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should prioritize context_window_size over [1m] model suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929[1m]', 200000);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });
    });

    describe('Models with [1m] suffix', () => {
        it('should return 1M context window for claude-sonnet-4-5 with [1m] suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929[1m]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should return 1M context window for claude-opus-4-6 with [1m] suffix', () => {
            const config = getContextConfig('claude-opus-4-6[1m]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should return 1M context window for AWS Bedrock format with [1m] suffix', () => {
            const config = getContextConfig(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]'
            );

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should return 1M context window with uppercase [1M] suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929[1M]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should return 1M context window for model IDs with 1M context label', () => {
            const config = getContextConfig('Opus 4.6 (1M context)');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should return 1M context window for model IDs with 1M token context label', () => {
            const config = getContextConfig('Claude Opus 4.6 - 1M token context');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should return 1M context window for model IDs with 1M in parentheses', () => {
            const config = getContextConfig('Opus 4.6 (1M)');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('should return 1M context window for model IDs with 1M in square brackets', () => {
            const config = getContextConfig('Opus 4.5 [1M]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });
    });

    describe('Models without [1m] suffix', () => {
        it('should return 200k context window for claude-sonnet-4-5 without [1m] suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929');

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });

        it('should return 200k context window for AWS Bedrock format without [1m] suffix', () => {
            const config = getContextConfig(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
            );

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });
    });

    describe('Older/default models', () => {
        it('should return 200k context window for older Sonnet 3.5 model', () => {
            const config = getContextConfig('claude-3-5-sonnet-20241022');

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });

        it('should return 200k context window when model ID is undefined', () => {
            const config = getContextConfig(undefined);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });

        it('should return 200k context window for unknown model ID', () => {
            const config = getContextConfig('claude-unknown-model');

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });
    });

    describe('Compaction overrides', () => {
        it('uses overrides.effectiveWindow over the model native window', () => {
            // 1M model, but autoCompactWindow=200k shrinks the effective window.
            const config = getContextConfig(
                'claude-opus-4-6[1m]',
                null,
                { effectiveWindow: 200000, ratio: null }
            );

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });

        it('uses overrides.effectiveWindow over the status-JSON context_window_size', () => {
            const config = getContextConfig(
                'claude-sonnet-4-5-20250929',
                1000000,
                { effectiveWindow: 150000 }
            );

            expect(config.maxTokens).toBe(150000);
            expect(config.usableTokens).toBe(120000);
        });

        it('uses overrides.ratio to replace the default 0.8 usable ratio', () => {
            // CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60 → ratio=0.6 → 200k * 0.6 = 120k.
            const config = getContextConfig(
                'claude-sonnet-4-5-20250929',
                null,
                { ratio: 0.6 }
            );

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(120000);
        });

        it('uses ratio=1.0 (DISABLE_AUTO_COMPACT) to treat the entire window as usable', () => {
            const config = getContextConfig(
                'claude-sonnet-4-5-20250929',
                null,
                { ratio: 1.0 }
            );

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(200000);
        });

        it('clamps ratio above 1.0 to avoid usableTokens > maxTokens', () => {
            const config = getContextConfig(
                'claude-sonnet-4-5-20250929',
                null,
                { ratio: 1.5 }
            );

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(200000);
        });

        it('falls back to default ratio when overrides.ratio is null/undefined/invalid', () => {
            const baseline = getContextConfig('claude-sonnet-4-5-20250929');

            expect(getContextConfig('claude-sonnet-4-5-20250929', null, { ratio: null }))
                .toEqual(baseline);
            expect(getContextConfig('claude-sonnet-4-5-20250929', null, { ratio: 0 }))
                .toEqual(baseline);
            expect(getContextConfig('claude-sonnet-4-5-20250929', null, { ratio: -0.5 }))
                .toEqual(baseline);
        });

        it('falls back to status/model window when overrides.effectiveWindow is null', () => {
            const config = getContextConfig(
                'claude-opus-4-6[1m]',
                null,
                { effectiveWindow: null, ratio: 0.5 }
            );

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(500000);
        });

        it('combines effectiveWindow + ratio for the full override case', () => {
            const config = getContextConfig(
                'claude-opus-4-6[1m]',
                null,
                { effectiveWindow: 200000, ratio: 0.6 }
            );

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(120000);
        });
    });
});

describe('getModelContextIdentifier', () => {
    it('returns string model identifier unchanged', () => {
        expect(getModelContextIdentifier('claude-sonnet-4-5-20250929[1m]')).toBe('claude-sonnet-4-5-20250929[1m]');
    });

    it('prefers both id and display name when available', () => {
        expect(getModelContextIdentifier({
            id: 'claude-opus-4-6',
            display_name: 'Opus 4.6 (1M context)'
        })).toBe('claude-opus-4-6 Opus 4.6 (1M context)');
    });

    it('returns display name when id is missing', () => {
        expect(getModelContextIdentifier({ display_name: 'Opus 4.6 (1M context)' })).toBe('Opus 4.6 (1M context)');
    });

    it('returns undefined when no model value exists', () => {
        expect(getModelContextIdentifier(undefined)).toBeUndefined();
        expect(getModelContextIdentifier({})).toBeUndefined();
    });
});
