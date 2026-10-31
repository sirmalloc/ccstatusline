import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { getContextConfig } from '../model-context';

const envKeys = [
    'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE',
    'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
    'DISABLE_AUTO_COMPACT',
    'DISABLE_COMPACT',
    'CCSTATUSLINE_CONTEXT_WINDOW_SIZE',
    'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK'
];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

beforeEach(() => {
    for (const key of envKeys) {
        Reflect.deleteProperty(process.env, key);
    }
});

afterEach(() => {
    for (const key of envKeys) {
        const value = originalEnv[key];
        if (value === undefined) {
            Reflect.deleteProperty(process.env, key);
        } else {
            process.env[key] = value;
        }
    }
});

describe('usable context budget', () => {
    it('keeps the existing 80% estimate without overrides', () => {
        expect(getContextConfig(undefined, 1000000)).toEqual({ maxTokens: 1000000, usableTokens: 800000 });
    });

    it('treats the configured compaction window as tokens without changing the full model window', () => {
        expect(getContextConfig(undefined, 1000000, { windowSize: 200000 }))
            .toEqual({ maxTokens: 1000000, usableTokens: 160000 });
    });

    it('prioritizes the environment window and applies a lower percentage to that window', () => {
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '500000';
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
        expect(getContextConfig(undefined, 1000000, { windowSize: 200000 }))
            .toEqual({ maxTokens: 1000000, usableTokens: 300000 });
    });

    it('never expands the compaction window past the effective full window', () => {
        process.env.CCSTATUSLINE_CONTEXT_WINDOW_SIZE = '300k';
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '500000';
        expect(getContextConfig(undefined, 200000)).toEqual({ maxTokens: 300000, usableTokens: 240000 });
    });

    it.each(['1', 'true', 'YES', 'on'])('uses the full window when auto-compaction is disabled with %s', (value) => {
        process.env.DISABLE_AUTO_COMPACT = value;
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '200000';
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
        expect(getContextConfig(undefined, 1000000, { windowSize: 100000, enabled: true }).usableTokens).toBe(1000000);
    });

    it('honors disabled compaction in settings and the all-compaction environment switch', () => {
        process.env.DISABLE_AUTO_COMPACT = 'false';
        expect(getContextConfig(undefined, 200000, { enabled: false }).usableTokens).toBe(200000);
        process.env.DISABLE_COMPACT = '1';
        expect(getContextConfig(undefined, 200000).usableTokens).toBe(200000);
    });

    it.each(['', 'nope', '60junk', '0', '-1', '0.5', '101', 'Infinity', '90', '100'])('does not raise the estimate for percentage %s', (value) => {
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = value;
        expect(getContextConfig(undefined, 200000).usableTokens).toBe(160000);
    });

    it('reads environment changes without a permanent ratio cache', () => {
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
        expect(getContextConfig(undefined, 200000).usableTokens).toBe(120000);
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '50';
        expect(getContextConfig(undefined, 200000).usableTokens).toBe(100000);
        delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
        expect(getContextConfig(undefined, 200000).usableTokens).toBe(160000);
    });

    it.each(['200000junk', '', '0', '-1', 'Infinity', 'NaN'])('falls back to settings when the environment window is invalid: %s', (value) => {
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = value;
        expect(getContextConfig(undefined, 1000000, { windowSize: 300000 }).usableTokens).toBe(240000);
    });

    it.each(['200', '1', '999', '0.1', '0.2k'])('clamps the small positive compaction window %s to 100k', (value) => {
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = value;
        expect(getContextConfig(undefined, 1000000, { windowSize: 300000 }))
            .toEqual({ maxTokens: 1000000, usableTokens: 80000 });
    });

    it.each([['50k', 80000], ['500k', 400000], ['2M', 800000]])('bounds the environment window %s', (value, expected) => {
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = value;
        expect(getContextConfig(undefined, 2000000).usableTokens).toBe(expected);
    });
});
