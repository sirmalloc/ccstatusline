import {
    describe,
    expect,
    it
} from 'vitest';

import { isExcludedFromProxy } from '../no-proxy';

describe('isExcludedFromProxy', () => {
    it.each([
        ['*'],
        ['api.anthropic.com'],
        ['anthropic.com'],
        ['.anthropic.com'],
        ['*.anthropic.com'],
        ['API.Anthropic.COM'],
        ['api.anthropic.com:443'],
        ['localhost, api.anthropic.com'],
        ['localhost,,anthropic.com'],
        ['localhost anthropic.com']
    ])('excludes api.anthropic.com for NO_PROXY=%j', (noProxy) => {
        expect(isExcludedFromProxy('api.anthropic.com', { NO_PROXY: noProxy })).toBe(true);
    });

    it.each([
        [''],
        ['localhost'],
        ['example.com'],
        ['pi.anthropic.com'],
        ['notanthropic.com'],
        ['api.anthropic.com:8443'],
        ['.']
    ])('keeps api.anthropic.com on the proxy for NO_PROXY=%j', (noProxy) => {
        expect(isExcludedFromProxy('api.anthropic.com', { NO_PROXY: noProxy })).toBe(false);
    });

    it('reads the lowercase no_proxy too', () => {
        expect(isExcludedFromProxy('status.claude.com', { no_proxy: 'claude.com' })).toBe(true);
    });

    it('excludes nothing when neither variable is set', () => {
        expect(isExcludedFromProxy('status.claude.com', {})).toBe(false);
    });
});
