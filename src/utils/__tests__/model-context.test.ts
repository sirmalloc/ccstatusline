import {
    describe,
    expect,
    it
} from 'vitest';

import { getContextConfig } from '../model-context';

describe('getContextConfig', () => {
    describe('Sonnet 4.5 models with [1m] suffix', () => {
        it('should return 1M context window for claude-sonnet-4-5 with [1m] suffix', () => {
            const maxTokens = getContextConfig('claude-sonnet-4-5-20250929[1m]');

            expect(maxTokens).toBe(1000000);
        });

        it('should return 1M context window for AWS Bedrock format with [1m] suffix', () => {
            const maxTokens = getContextConfig(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]'
            );

            expect(maxTokens).toBe(1000000);
        });

        it('should return 1M context window with uppercase [1M] suffix', () => {
            const maxTokens = getContextConfig('claude-sonnet-4-5-20250929[1M]');

            expect(maxTokens).toBe(1000000);
        });
    });

    describe('Sonnet 4.5 models without [1m] suffix', () => {
        it('should return 200k context window for claude-sonnet-4-5 without [1m] suffix', () => {
            const maxTokens = getContextConfig('claude-sonnet-4-5-20250929');

            expect(maxTokens).toBe(200000);
        });

        it('should return 200k context window for AWS Bedrock format without [1m] suffix', () => {
            const maxTokens = getContextConfig(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
            );

            expect(maxTokens).toBe(200000);
        });
    });

    describe('Older/default models', () => {
        it('should return 200k context window for older Sonnet 3.5 model', () => {
            const maxTokens = getContextConfig('claude-3-5-sonnet-20241022');

            expect(maxTokens).toBe(200000);
        });

        it('should return 200k context window when model ID is undefined', () => {
            const maxTokens = getContextConfig(undefined);

            expect(maxTokens).toBe(200000);
        });

        it('should return 200k context window for unknown model ID', () => {
            const maxTokens = getContextConfig('claude-unknown-model');

            expect(maxTokens).toBe(200000);
        });
    });
});