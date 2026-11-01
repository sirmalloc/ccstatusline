import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    getContextConfig,
    getModelContextIdentifier
} from '../model-context';

describe('getContextConfig', () => {
    const originalOverride = process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE;
    const originalFallback = process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK;

    beforeEach(() => {
        delete process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE;
        delete process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK;
    });

    afterEach(() => {
        if (originalOverride === undefined) {
            delete process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE;
        } else {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = originalOverride;
        }
        if (originalFallback === undefined) {
            delete process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK;
        } else {
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = originalFallback;
        }
    });

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

    describe('CCSTATUSLINE_CONTEXT_WINDOW_SIZE env override', () => {
        it('overrides context_window_size from status JSON with a raw number', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1000000';
            const config = getContextConfig('mimo-v2.5-pro', 200000);

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('accepts a k/m suffix', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1M';
            const config = getContextConfig('mimo-v2.5-pro', 200000);

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('ignores invalid values and falls through to status JSON value', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = 'nope';
            const config = getContextConfig('claude-3-5-sonnet-20241022', 200000);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });

        it('ignores zero, negative, and empty values', () => {
            for (const bad of ['0', '-1', '', '   ']) {
                process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = bad;
                const config = getContextConfig('claude-3-5-sonnet-20241022', 200000);
                expect(config.maxTokens).toBe(200000);
            }
        });

        it('rejects nonsensically small windows (< 1000)', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1.5';
            const config = getContextConfig('claude-3-5-sonnet-20241022', 200000);

            expect(config.maxTokens).toBe(200000);
        });

        it('accepts underscore and comma separators', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1_000_000';
            expect(getContextConfig('m', 200000).maxTokens).toBe(1000000);

            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1,000,000';
            expect(getContextConfig('m', 200000).maxTokens).toBe(1000000);
        });

        it('accepts decimals with a unit', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1.5M';
            expect(getContextConfig('m', 200000).maxTokens).toBe(1500000);
        });

        it('accepts whitespace-padded and lowercase unit', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '  200k  ';
            expect(getContextConfig('m', 1000000).maxTokens).toBe(200000);
        });

        it('overrides model-suffix parsing when no status JSON value is provided', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '500k';
            expect(getContextConfig('claude-sonnet-4-5[1m]').maxTokens).toBe(500000);
        });

        it('takes precedence over the fallback environment setting', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1M';
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '500000';

            expect(getContextConfig(undefined)).toEqual({
                maxTokens: 1000000,
                usableTokens: 800000
            });
        });

        it('uses the fallback setting after an override becomes invalid or is removed', () => {
            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '1M';
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '500000';
            expect(getContextConfig(undefined).maxTokens).toBe(1000000);

            process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = 'invalid';
            expect(getContextConfig(undefined)).toEqual({
                maxTokens: 500000,
                usableTokens: 400000
            });

            delete process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE;
            expect(getContextConfig(undefined).maxTokens).toBe(500000);
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

    describe('CCSTATUSLINE_CONTEXT_SIZE_FALLBACK override', () => {
        it('uses the env value as the fallback when no window size is otherwise known', () => {
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '1000000';
            const config = getContextConfig('claude-sonnet-4-5-20250929');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
        });

        it('uses the env value as the fallback when the model is unknown', () => {
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '500000';
            const config = getContextConfig(undefined);

            expect(config.maxTokens).toBe(500000);
            expect(config.usableTokens).toBe(400000);
        });

        it('falls back to 200k when the env value is non-numeric', () => {
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = 'not-a-number';
            const config = getContextConfig('claude-3-5-sonnet-20241022');

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(160000);
        });

        it('falls back to 200k when the env value is zero or negative', () => {
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '0';
            expect(getContextConfig(undefined).maxTokens).toBe(200000);

            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '-5';
            expect(getContextConfig(undefined).maxTokens).toBe(200000);
        });

        it('does not override the live context_window_size from the status JSON', () => {
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '500000';
            const config = getContextConfig('claude-3-5-sonnet-20241022', 1000000);

            expect(config.maxTokens).toBe(1000000);
        });

        it('does not override a [1m] model-name hint', () => {
            process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '500000';
            const config = getContextConfig('claude-sonnet-4-5-20250929[1m]');

            expect(config.maxTokens).toBe(1000000);
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
