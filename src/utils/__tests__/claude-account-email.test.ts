import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getClaudeAccountEmail,
    type AccountEmailDeps
} from '../claude-account-email';

let tempDir: string;
let claudeJsonPath: string;
let cachePath: string;
let deps: AccountEmailDeps;
let readSpy: ReturnType<typeof vi.fn>;

function writeClaudeJson(content: string, mtimeSeconds?: number): void {
    fs.writeFileSync(claudeJsonPath, content, 'utf-8');
    if (mtimeSeconds !== undefined) {
        fs.utimesSync(claudeJsonPath, mtimeSeconds, mtimeSeconds);
    }
}

function claudeJsonReads(): number {
    return readSpy.mock.calls.filter(call => call[0] === claudeJsonPath).length;
}

describe('getClaudeAccountEmail', () => {
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-account-email-'));
        claudeJsonPath = path.join(tempDir, '.claude.json');
        cachePath = path.join(tempDir, 'cache', 'claude-account-email.json');
        readSpy = vi.fn((p: string) => fs.readFileSync(p, 'utf-8'));
        deps = {
            statSync: (p: string) => fs.statSync(p),
            readFileSync: readSpy as unknown as (p: string) => string,
            writeFileSync: (p: string, data: string) => { fs.writeFileSync(p, data, 'utf-8'); },
            renameSync: (from: string, to: string) => { fs.renameSync(from, to); },
            mkdirSync: (p: string) => { fs.mkdirSync(p, { recursive: true }); },
            getClaudeJsonPath: () => claudeJsonPath,
            getCachePath: () => cachePath
        };
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns null without caching when .claude.json is missing', () => {
        expect(getClaudeAccountEmail(deps)).toBeNull();
        expect(fs.existsSync(cachePath)).toBe(false);
    });

    it('parses .claude.json once and serves repeat calls from the cache', () => {
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'user@example.com' } }));

        expect(getClaudeAccountEmail(deps)).toBe('user@example.com');
        expect(getClaudeAccountEmail(deps)).toBe('user@example.com');
        expect(claudeJsonReads()).toBe(1);
    });

    it('caches a missing email as a hit', () => {
        writeClaudeJson(JSON.stringify({ projects: {} }));

        expect(getClaudeAccountEmail(deps)).toBeNull();
        expect(getClaudeAccountEmail(deps)).toBeNull();
        expect(claudeJsonReads()).toBe(1);
    });

    it('treats non-string and empty emails as missing', () => {
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 12345 } }), 1000);
        expect(getClaudeAccountEmail(deps)).toBeNull();

        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: '' } }), 2000);
        expect(getClaudeAccountEmail(deps)).toBeNull();
    });

    it('re-reads when the mtime changes', () => {
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'a@example.com' } }), 1000);
        expect(getClaudeAccountEmail(deps)).toBe('a@example.com');

        // Same size, different mtime.
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'b@example.com' } }), 2000);
        expect(getClaudeAccountEmail(deps)).toBe('b@example.com');
        expect(claudeJsonReads()).toBe(2);
    });

    it('re-reads when the size changes', () => {
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'a@example.com' } }), 1000);
        expect(getClaudeAccountEmail(deps)).toBe('a@example.com');

        // Same mtime, different size.
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'longer@example.com' } }), 1000);
        expect(getClaudeAccountEmail(deps)).toBe('longer@example.com');
        expect(claudeJsonReads()).toBe(2);
    });

    it('re-reads when the cache was written for a different .claude.json path', () => {
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'a@example.com' } }), 1000);
        expect(getClaudeAccountEmail(deps)).toBe('a@example.com');

        const otherPath = path.join(tempDir, 'other.json');
        fs.copyFileSync(claudeJsonPath, otherPath);
        fs.utimesSync(otherPath, 1000, 1000);
        fs.writeFileSync(otherPath, JSON.stringify({ oauthAccount: { emailAddress: 'b@example.com' } }), 'utf-8');
        fs.utimesSync(otherPath, 1000, 1000);
        claudeJsonPath = otherPath;

        expect(getClaudeAccountEmail(deps)).toBe('b@example.com');
    });

    it('treats a corrupt cache file as a miss', () => {
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'user@example.com' } }));
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, '{not json', 'utf-8');

        expect(getClaudeAccountEmail(deps)).toBe('user@example.com');
        expect(getClaudeAccountEmail(deps)).toBe('user@example.com');
        expect(claudeJsonReads()).toBe(1);
    });

    it('does not cache a parse failure, so a later valid file is picked up', () => {
        writeClaudeJson('{not json', 1000);
        expect(getClaudeAccountEmail(deps)).toBeNull();
        expect(getClaudeAccountEmail(deps)).toBeNull();
        expect(claudeJsonReads()).toBe(2);
        expect(fs.existsSync(cachePath)).toBe(false);
    });

    it('still returns the email when the cache cannot be written', () => {
        writeClaudeJson(JSON.stringify({ oauthAccount: { emailAddress: 'user@example.com' } }));
        deps.writeFileSync = () => { throw new Error('EROFS'); };

        expect(getClaudeAccountEmail(deps)).toBe('user@example.com');
    });
});
