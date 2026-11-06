import {
    describe,
    expect,
    it
} from 'vitest';

import {
    formatMissAge,
    formatMissCause,
    getPromptCache
} from '../prompt-cache';

describe('formatMissCause', () => {
    it('names changed tools with how many were added and removed, leaving out zeros', () => {
        expect(formatMissCause({ causes: ['tools_changed'], tools_added: 2, tools_removed: 0 })).toBe('tools changed (+2)');
        expect(formatMissCause({ causes: ['tools_changed'], tools_added: 0, tools_removed: 3 })).toBe('tools changed (−3)');
        expect(formatMissCause({ causes: ['tools_changed'], tools_added: 2, tools_removed: 1 })).toBe('tools changed (+2, −1)');
        expect(formatMissCause({ causes: ['tools_changed'] })).toBe('tools changed');
    });

    it('gives the system prompt\'s change in length with its sign', () => {
        expect(formatMissCause({ causes: ['system_prompt_changed'], system_char_delta: 120 })).toBe('system prompt changed (+120 chars)');
        expect(formatMissCause({ causes: ['system_prompt_changed'], system_char_delta: -45 })).toBe('system prompt changed (−45 chars)');
        expect(formatMissCause({ causes: ['system_prompt_changed'], system_char_delta: 0 })).toBe('system prompt changed');
        expect(formatMissCause({ causes: ['system_prompt_changed'] })).toBe('system prompt changed');
    });

    it('names an expired TTL by its lifetime', () => {
        expect(formatMissCause({ causes: ['ttl_expired_5m'] })).toBe('5m TTL expired');
        expect(formatMissCause({ causes: ['ttl_expired_1h'] })).toBe('1h TTL expired');
    });

    it('reads the server-side cause and causes it doesn\'t know as words', () => {
        expect(formatMissCause({ causes: ['likely_server_side'] })).toBe('likely server side');
        expect(formatMissCause({ causes: ['model_switched'] })).toBe('model switched');
    });

    it('joins several causes', () => {
        expect(formatMissCause({ causes: ['tools_changed', 'ttl_expired_5m'], tools_added: 1 })).toBe('tools changed (+1), 5m TTL expired');
    });

    it('says the cause is unknown when Claude Code identified none', () => {
        expect(formatMissCause(null)).toBe('cause unknown');
        expect(formatMissCause(undefined)).toBe('cause unknown');
        expect(formatMissCause({ causes: [] })).toBe('cause unknown');
    });
});

describe('formatMissAge', () => {
    // Three minutes after a miss at 1738425230
    const nowMs = 1738425410 * 1000;

    it('gives the time since the miss compactly', () => {
        expect(formatMissAge(1738425230, nowMs)).toBe('3m ago');
        expect(formatMissAge(1738425230 - 3600, nowMs)).toBe('1h3m ago');
    });

    it('says just now within a minute, and for a miss stamped ahead of the clock', () => {
        expect(formatMissAge(1738425400, nowMs)).toBe('just now');
        expect(formatMissAge(1738425500, nowMs)).toBe('just now');
    });
});

describe('getPromptCache', () => {
    it('reads prompt_cache from the status line payload', () => {
        expect(getPromptCache({ data: { prompt_cache: { requests: 14, misses: 2 } } })).toEqual({ requests: 14, misses: 2 });
    });

    it('returns null before Claude Code reports one', () => {
        expect(getPromptCache({})).toBeNull();
        expect(getPromptCache({ data: {} })).toBeNull();
        expect(getPromptCache({ data: { prompt_cache: null } })).toBeNull();
    });
});
