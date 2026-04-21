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
            expect(config.usableTokens).toBe(967000);
        });

        it('should prioritize context_window_size over [1m] model suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929[1m]', 200000);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(167000);
        });
    });

    describe('Models with [1m] suffix', () => {
        it('should return 1M context window for claude-sonnet-4-5 with [1m] suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929[1m]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });

        it('should return 1M context window for claude-opus-4-6 with [1m] suffix', () => {
            const config = getContextConfig('claude-opus-4-6[1m]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });

        it('should return 1M context window for AWS Bedrock format with [1m] suffix', () => {
            const config = getContextConfig(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]'
            );

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });

        it('should return 1M context window with uppercase [1M] suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929[1M]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });

        it('should return 1M context window for model IDs with 1M context label', () => {
            const config = getContextConfig('Opus 4.6 (1M context)');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });

        it('should return 1M context window for model IDs with 1M token context label', () => {
            const config = getContextConfig('Claude Opus 4.6 - 1M token context');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });

        it('should return 1M context window for model IDs with 1M in parentheses', () => {
            const config = getContextConfig('Opus 4.6 (1M)');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });

        it('should return 1M context window for model IDs with 1M in square brackets', () => {
            const config = getContextConfig('Opus 4.5 [1M]');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(967000);
        });
    });

    describe('Models without [1m] suffix', () => {
        it('should return 200k context window for claude-sonnet-4-5 without [1m] suffix', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929');

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(167000);
        });

        it('should return 200k context window for AWS Bedrock format without [1m] suffix', () => {
            const config = getContextConfig(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
            );

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(167000);
        });
    });

    describe('Older/default models', () => {
        it('should return 200k context window for older Sonnet 3.5 model', () => {
            const config = getContextConfig('claude-3-5-sonnet-20241022');

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(167000);
        });

        it('should return 200k context window when model ID is undefined', () => {
            const config = getContextConfig(undefined);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(167000);
        });

        it('should return 200k context window for unknown model ID', () => {
            const config = getContextConfig('claude-unknown-model');

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(167000);
        });
    });

    describe('autocompactPercent override', () => {
        it('should lower usable tokens when override is below default threshold', () => {
            // 200k window: effectiveWindow = 180,000
            // default threshold = 167,000
            // 50% of effectiveWindow = 90,000 < 167,000 -> use 90,000
            const config = getContextConfig('claude-3-5-sonnet-20241022', null, 50);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(90000);
        });

        it('should clamp to default threshold when override would raise above it', () => {
            // 200k window: effectiveWindow = 180,000
            // default threshold = 167,000
            // 99% of effectiveWindow = 178,200 > 167,000 -> clamp to 167,000
            const config = getContextConfig('claude-3-5-sonnet-20241022', null, 99);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(167000);
        });

        it('should apply override to 1M context window', () => {
            // 1M window: effectiveWindow = 980,000
            // default threshold = 967,000
            // 50% of effectiveWindow = 490,000 < 967,000 -> use 490,000
            const config = getContextConfig('claude-sonnet-4-5-20250929[1m]', null, 50);

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(490000);
        });

        it('should apply override when context_window_size is provided', () => {
            // 200k from status JSON, 50% override
            // effectiveWindow = 180,000, 50% = 90,000
            const config = getContextConfig('claude-3-5-sonnet-20241022', 200000, 50);

            expect(config.maxTokens).toBe(200000);
            expect(config.usableTokens).toBe(90000);
        });

        it('should ignore null autocompact percent', () => {
            const config = getContextConfig('claude-3-5-sonnet-20241022', null, null);

            expect(config.usableTokens).toBe(167000);
        });

        it('should ignore invalid autocompact percent values', () => {
            expect(getContextConfig(undefined, null, 0).usableTokens).toBe(167000);
            expect(getContextConfig(undefined, null, 101).usableTokens).toBe(167000);
            expect(getContextConfig(undefined, null, -5).usableTokens).toBe(167000);
        });
    });

    describe('Small context windows', () => {
        it('should floor usable tokens at 1 to prevent zero or negative values', () => {
            // contextWindow = 30,000
            // effectiveWindow = 30,000 - 20,000 = 10,000
            // defaultThreshold = 10,000 - 13,000 = -3,000 -> clamped to 1
            const config = getContextConfig(undefined, 30000);

            expect(config.maxTokens).toBe(30000);
            expect(config.usableTokens).toBe(1);
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