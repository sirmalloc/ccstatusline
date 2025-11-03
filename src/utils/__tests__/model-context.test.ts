import {
    describe,
    expect,
    it
} from 'vitest';

import { getContextConfig } from '../model-context';

describe('getContextConfig', () => {
    describe('Sonnet 4.5 models', () => {
        it('should return 1M context window for claude-sonnet-4-5-20250929 model', () => {
            const config = getContextConfig('claude-sonnet-4-5-20250929');

            expect(config.maxTokens).toBe(1000000);
            expect(config.usableTokens).toBe(800000);
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
});