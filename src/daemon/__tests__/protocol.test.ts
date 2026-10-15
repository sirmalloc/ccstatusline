import {
    describe,
    expect,
    it
} from 'vitest';

import type { InvocationContext } from '../protocol';
import {
    ENV_ALLOWLIST,
    MAX_CONTEXT_BYTES,
    decodeContext,
    encodeContext,
    makeToken,
    tokensMatch
} from '../protocol';

function roundTrip(context: InvocationContext): InvocationContext {
    const decoded = decodeContext(encodeContext(context));
    if (!decoded.ok) {
        throw new Error(`decode failed: ${decoded.error}`);
    }
    return decoded.context;
}

function rawContext(payload: string): string {
    return Buffer.from(payload, 'utf8').toString('base64');
}

describe('context encoding', () => {
    it('round-trips values with spaces, Unicode, quotes, and newlines', () => {
        const context = roundTrip({
            env: {
                CLAUDE_CONFIG_DIR: '/home/ü/claude dir with "quotes"',
                COLUMNS: 'l1\nl2'
            },
            cwd: '/tmp/some dir/✓'
        });

        expect(context.env.CLAUDE_CONFIG_DIR).toBe('/home/ü/claude dir with "quotes"');
        expect(context.env.COLUMNS).toBe('l1\nl2');
        expect(context.cwd).toBe('/tmp/some dir/✓');
    });

    it('distinguishes an empty value from an absent one', () => {
        const context = roundTrip({ env: { HTTPS_PROXY: '' }, cwd: null });

        expect(context.env.HTTPS_PROXY).toBe('');
        expect(context.env.NO_PROXY).toBeUndefined();
    });

    it('encodes only allowlisted names and the cwd key', () => {
        const encoded = encodeContext({ env: { CCSTATUSLINE_WIDTH: '80' }, cwd: '/tmp' });
        const text = Buffer.from(encoded, 'base64').toString('utf8');

        expect(text).toContain('CCSTATUSLINE_WIDTH=80');
        expect(text).toContain('cwd=/tmp');
        expect(text).not.toContain('NO_PROXY');
    });
});

describe('context decoding', () => {
    it('accepts a valid header', () => {
        const decoded = decodeContext(rawContext('CLAUDE_CONFIG_DIR=/x\0cwd=/tmp\0'));

        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
            expect(decoded.context.env.CLAUDE_CONFIG_DIR).toBe('/x');
            expect(decoded.context.cwd).toBe('/tmp');
        }
    });

    it('rejects non-base64 and corrupt headers instead of decoding to an empty context', () => {
        expect(decodeContext('not base64!!').ok).toBe(false);
        expect(decodeContext('!!!!').ok).toBe(false);
        expect(decodeContext('').ok).toBe(false);
    });

    it('rejects oversized headers', () => {
        const huge = 'A'.repeat(MAX_CONTEXT_BYTES + 1);
        expect(decodeContext(huge).ok).toBe(false);
    });

    it('rejects env names outside the allowlist', () => {
        const decoded = decodeContext(rawContext('NODE_OPTIONS=--inspect\0'));

        expect(decoded.ok).toBe(false);
        if (!decoded.ok) {
            expect(decoded.error).toContain('allowlist');
        }
    });

    it('rejects duplicate entries and malformed framing', () => {
        expect(decodeContext(rawContext('COLUMNS=1\0COLUMNS=2\0')).ok).toBe(false);
        expect(decodeContext(rawContext('NO_EQUALS_SIGN\0')).ok).toBe(false);
        expect(decodeContext(rawContext('=novalue\0')).ok).toBe(false);
    });

    it('rejects a relative cwd but accepts an absent one', () => {
        expect(decodeContext(rawContext('cwd=relative/path\0')).ok).toBe(false);
        expect(decodeContext(rawContext('cwd=/tmp\0cwd=/tmp\0')).ok).toBe(false);

        const decoded = decodeContext(rawContext('CLAUDE_CONFIG_DIR=/x\0'));
        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
            expect(decoded.context.cwd).toBeNull();
        }
    });
});

describe('auth tokens', () => {
    it('generates 64-char hex tokens', () => {
        const token = makeToken();

        expect(token).toMatch(/^[0-9a-f]{64}$/);
        expect(token).not.toEqual(makeToken());
    });

    it('matches equal tokens and rejects different ones', () => {
        const token = makeToken();

        expect(tokensMatch(token, token)).toBe(true);
        expect(tokensMatch(token, `0${token.slice(0, 63)}`)).toBe(false);
        expect(tokensMatch(token, '')).toBe(false);
    });
});

describe('ENV_ALLOWLIST', () => {
    it('covers exactly the vars the render path reads from process.env', () => {
        expect([...ENV_ALLOWLIST].sort()).toEqual([
            'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK',
            'CCSTATUSLINE_WIDTH',
            'CLAUDE_CONFIG_DIR',
            'CLAUDE_SECURESTORAGE_CONFIG_DIR',
            'COLUMNS',
            'HTTPS_PROXY',
            'NO_PROXY'
        ]);
    });
});
