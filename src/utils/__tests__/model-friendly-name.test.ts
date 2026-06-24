import {
    describe,
    expect,
    it
} from 'vitest';

import { getFriendlyModelName } from '../model-friendly-name';

describe('getFriendlyModelName', () => {
    describe('Claude 4+ models — Opus 4.6', () => {
        it('should parse global.anthropic opus 4.6 with [1m]', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-opus-4-6-v1[1m]'
            )).toBe('Opus 4.6 (1M context)');
        });

        it('should parse global.anthropic opus 4.6 without [1m]', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-opus-4-6-v1'
            )).toBe('Opus 4.6');
        });

        it('should parse us.anthropic opus 4.6 with [1m]', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-opus-4-6-v1[1m]'
            )).toBe('Opus 4.6 (1M context)');
        });

        it('should parse us.anthropic opus 4.6 without [1m]', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-opus-4-6-v1'
            )).toBe('Opus 4.6');
        });

        it('should parse anthropic.claude opus 4.6', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-opus-4-6-v1'
            )).toBe('Opus 4.6');
        });
    });

    describe('Claude 4+ models — Sonnet 4.6', () => {
        it('should parse global.anthropic sonnet 4.6 with [1m]', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-sonnet-4-6[1m]'
            )).toBe('Sonnet 4.6 (1M context)');
        });

        it('should parse global.anthropic sonnet 4.6 without [1m]', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-sonnet-4-6'
            )).toBe('Sonnet 4.6');
        });

        it('should parse us.anthropic sonnet 4.6 with [1m]', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-sonnet-4-6[1m]'
            )).toBe('Sonnet 4.6 (1M context)');
        });

        it('should parse us.anthropic sonnet 4.6 without [1m]', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-sonnet-4-6'
            )).toBe('Sonnet 4.6');
        });

        it('should parse anthropic.claude sonnet 4.6', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-sonnet-4-6'
            )).toBe('Sonnet 4.6');
        });
    });

    describe('Claude 4+ models — Sonnet 4.5', () => {
        it('should parse global.anthropic sonnet 4.5 with [1m]', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]'
            )).toBe('Sonnet 4.5 (1M context)');
        });

        it('should parse global.anthropic sonnet 4.5 without [1m]', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-sonnet-4-5-20250929-v1:0'
            )).toBe('Sonnet 4.5');
        });

        it('should parse us.anthropic sonnet 4.5 with [1m]', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0[1m]'
            )).toBe('Sonnet 4.5 (1M context)');
        });

        it('should parse us.anthropic sonnet 4.5 without [1m]', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
            )).toBe('Sonnet 4.5');
        });

        it('should parse anthropic.claude sonnet 4.5', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-sonnet-4-5-20250929-v1:0'
            )).toBe('Sonnet 4.5');
        });
    });

    describe('Claude 4+ models — Haiku 4.5', () => {
        it('should parse global.anthropic haiku 4.5', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-haiku-4-5-20251001-v1:0'
            )).toBe('Haiku 4.5');
        });

        it('should parse us.anthropic haiku 4.5', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-haiku-4-5-20251001-v1:0'
            )).toBe('Haiku 4.5');
        });

        it('should parse anthropic.claude haiku 4.5', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-haiku-4-5-20251001-v1:0'
            )).toBe('Haiku 4.5');
        });
    });

    describe('Claude 4+ models — Opus 4.5', () => {
        it('should parse anthropic.claude opus 4.5', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-opus-4-5-20251101-v1:0'
            )).toBe('Opus 4.5');
        });
    });

    describe('Claude 3.x models — Haiku 3.5', () => {
        it('should parse anthropic.claude haiku 3.5', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-3-5-haiku-20241022-v1:0'
            )).toBe('Haiku 3.5');
        });

        it('should parse global.anthropic haiku 3.5', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-3-5-haiku-20241022-v1:0'
            )).toBe('Haiku 3.5');
        });

        it('should parse us.anthropic haiku 3.5', () => {
            expect(getFriendlyModelName(
                'us.anthropic.claude-3-5-haiku-20241022-v1:0'
            )).toBe('Haiku 3.5');
        });
    });

    describe('Claude 3.x models — Sonnet 3.7', () => {
        it('should parse anthropic.claude sonnet 3.7', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-3-7-sonnet-20250219-v1:0'
            )).toBe('Sonnet 3.7');
        });
    });

    describe('Claude 3.x models — Sonnet 3.5', () => {
        it('should parse anthropic.claude sonnet 3.5 v2', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-3-5-sonnet-20241022-v2:0'
            )).toBe('Sonnet 3.5');
        });

        it('should parse anthropic.claude sonnet 3.5 v2 with size qualifier', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-3-5-sonnet-20241022-v2:0:200k'
            )).toBe('Sonnet 3.5');
        });
    });

    describe('Claude 3.x models — without minor version', () => {
        it('should parse anthropic.claude opus 3', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-3-opus-20240229-v1:0'
            )).toBe('Opus 3');
        });

        it('should parse anthropic.claude haiku 3', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-3-haiku-20240307-v1:0'
            )).toBe('Haiku 3');
        });

        it('should parse anthropic.claude sonnet 3', () => {
            expect(getFriendlyModelName(
                'anthropic.claude-3-sonnet-20240229-v1:0'
            )).toBe('Sonnet 3');
        });
    });

    describe('bare claude model IDs (Pro/Max)', () => {
        it('should parse bare claude opus with [1m]', () => {
            expect(getFriendlyModelName(
                'claude-opus-4-6[1m]'
            )).toBe('Opus 4.6 (1M context)');
        });

        it('should parse bare claude sonnet with date', () => {
            expect(getFriendlyModelName(
                'claude-sonnet-4-5-20250929'
            )).toBe('Sonnet 4.5');
        });

        it('should parse bare claude sonnet with date and [1m]', () => {
            expect(getFriendlyModelName(
                'claude-sonnet-4-5-20250929[1m]'
            )).toBe('Sonnet 4.5 (1M context)');
        });
    });

    describe('case insensitive [1M] suffix', () => {
        it('should handle uppercase [1M]', () => {
            expect(getFriendlyModelName(
                'global.anthropic.claude-opus-4-6-v1[1M]'
            )).toBe('Opus 4.6 (1M context)');
        });
    });

    describe('unrecognized model strings', () => {
        it('should return the original string for non-claude models', () => {
            expect(getFriendlyModelName('gpt-4o')).toBe('gpt-4o');
        });

        it('should return the original string for empty input', () => {
            expect(getFriendlyModelName('')).toBe('');
        });

        it('should return the original string for unexpected formats', () => {
            expect(getFriendlyModelName('some-random-model')).toBe('some-random-model');
        });
    });
});