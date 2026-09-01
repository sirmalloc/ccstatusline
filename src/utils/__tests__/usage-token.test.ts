import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Mock } from 'vitest';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import * as claudeSettings from '../claude-settings';
import {
    getMacKeychainConfigDirService,
    getUsageToken,
    parseMacKeychainCredentialCandidates
} from '../usage-fetch';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const CREDENTIALS_FILE = path.join('/fake/claude', '.credentials.json');
const mockedExecFileSync = execFileSync as unknown as Mock;
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
const ORIGINAL_SECURESTORAGE_CONFIG_DIR = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;

// The config-dir lookup keys off these variables, so every test starts from
// the default (unset) profile regardless of the environment running the suite.
beforeEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
});

afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
    if (ORIGINAL_CLAUDE_CONFIG_DIR !== undefined) {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
    if (ORIGINAL_SECURESTORAGE_CONFIG_DIR !== undefined) {
        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = ORIGINAL_SECURESTORAGE_CONFIG_DIR;
    }
});

function makeConfigDirService(configDir: string): string {
    return `Claude Code-credentials-${createHash('sha256').update(configDir).digest('hex').slice(0, 8)}`;
}

function makeTokenPayload(token: string): string {
    return JSON.stringify({ claudeAiOauth: { accessToken: token } });
}

function encodeAsciiAsHex(value: string): string {
    return Buffer.from(value, 'utf8').toString('hex');
}

function makeKeychainBlock(service: string, modifiedAt?: { raw?: string; quoted?: string }): string {
    const lines = [
        'keychain: "/Users/example/Library/Keychains/login.keychain-db"',
        'version: 512',
        'class: "genp"',
        'attributes:',
        `    "svce"<blob>="${service}"`
    ];

    if (modifiedAt?.raw && modifiedAt.quoted) {
        lines.push(`    "mdat"<timedate>=0x${modifiedAt.raw}    "${modifiedAt.quoted}"`);
    } else if (modifiedAt?.raw) {
        lines.push(`    "mdat"<timedate>=0x${modifiedAt.raw}`);
    } else if (modifiedAt?.quoted) {
        lines.push(`    "mdat"<timedate>="${modifiedAt.quoted}"`);
    }

    return lines.join('\n');
}

function getSecurityCallLog(): string[] {
    return mockedExecFileSync.mock.calls.map((call) => {
        const [command, args]: [string, string[] | undefined] = call as [string, string[] | undefined];

        expect(command).toBe('security');
        return Array.isArray(args) ? args.join(' ') : '';
    });
}

function mockCredentialsFile(payload?: string): void {
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
        if (filePath === CREDENTIALS_FILE) {
            if (payload === undefined) {
                throw new Error('credentials file missing');
            }

            expect(options).toBe('utf8');
            return payload;
        }

        throw new Error(`Unexpected file read: ${String(filePath)}`);
    });
}

describe('parseMacKeychainCredentialCandidates', () => {
    it('returns hashed macOS credential candidates sorted newest-first and excludes the exact service', () => {
        const dump = [
            makeKeychainBlock('Claude Code-credentials', { quoted: '20240101010101Z' }),
            makeKeychainBlock('Claude Code-credentials-old', { quoted: '20240201010101Z' }),
            makeKeychainBlock('Claude Code-credentials-new', { quoted: '20240301010101Z' })
        ].join('\n');

        expect(parseMacKeychainCredentialCandidates(dump)).toEqual([
            'Claude Code-credentials-new',
            'Claude Code-credentials-old'
        ]);
    });

    it('uses discovered order when modified times are unavailable and parses hex-only timestamps when present', () => {
        const dump = [
            makeKeychainBlock('Claude Code-credentials-first'),
            makeKeychainBlock('Claude Code-credentials-second', { raw: encodeAsciiAsHex('20240401010101Z\0') }),
            makeKeychainBlock('Claude Code-credentials-third')
        ].join('\n');

        expect(parseMacKeychainCredentialCandidates(dump)).toEqual([
            'Claude Code-credentials-second',
            'Claude Code-credentials-first',
            'Claude Code-credentials-third'
        ]);
    });
});

describe('getUsageToken', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(claudeSettings, 'getClaudeConfigDir').mockReturnValue('/fake/claude');
        mockedExecFileSync.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        mockedExecFileSync.mockReset();
    });

    it('prefers the exact macOS keychain service over hashed fallbacks and files', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                return makeTokenPayload('exact-token');
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('exact-token');
        expect(getUsageToken()).toBe('exact-token');
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -w',
            'find-generic-password -s Claude Code-credentials -w'
        ]);
    });

    it('tries the newest hashed macOS keychain candidate after an exact miss', () => {
        const dump = [
            makeKeychainBlock('Claude Code-credentials-old', { quoted: '20240201010101Z' }),
            makeKeychainBlock('Claude Code-credentials-new', { quoted: '20240301010101Z' })
        ].join('\n');

        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                throw new Error('missing exact credential');
            }

            if (args[0] === 'dump-keychain') {
                return dump;
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials-new') {
                return makeTokenPayload('hashed-token');
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageToken()).toBe('hashed-token');
        expect(getUsageToken()).toBe('hashed-token');
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-new -w',
            'find-generic-password -s Claude Code-credentials -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-new -w'
        ]);
    });

    it('falls back to ~/.claude/.credentials.json on macOS when keychain lookups miss or parse invalid data', () => {
        const dump = makeKeychainBlock('Claude Code-credentials-hashed', { quoted: '20240301010101Z' });

        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                throw new Error('missing exact credential');
            }

            if (args[0] === 'dump-keychain') {
                return dump;
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials-hashed') {
                return 'not-json';
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getUsageToken()).toBe('file-token');
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-hashed -w',
            'find-generic-password -s Claude Code-credentials -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-hashed -w'
        ]);
    });

    it('uses the credentials file on non-macOS', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        mockCredentialsFile(makeTokenPayload('linux-file-token'));

        expect(getUsageToken()).toBe('linux-file-token');
        expect(getUsageToken()).toBe('linux-file-token');
        expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('reads the CLAUDE_CONFIG_DIR keychain service first and skips the plain service on a hit', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === configDirService) {
                return makeTokenPayload('profile-token');
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('profile-token');
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -w`
        ]);
    });

    it('falls back to the plain keychain service when the CLAUDE_CONFIG_DIR entry is missing', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            if (args[0] === 'find-generic-password' && args[2] === configDirService) {
                throw new Error('missing profile credential');
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                return makeTokenPayload('exact-token');
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageToken()).toBe('exact-token');
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -w`,
            'find-generic-password -s Claude Code-credentials -w'
        ]);
    });
});

describe('getMacKeychainConfigDirService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(claudeSettings, 'getClaudeConfigDir').mockReturnValue('/fake/claude');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns null for the default profile', () => {
        expect(getMacKeychainConfigDirService()).toBeNull();
    });

    it('suffixes the service with the first 8 hex chars of sha256(config dir) when CLAUDE_CONFIG_DIR is set', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/claude'));
    });

    it('hashes the NFC-normalized directory, matching Claude Code', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/café';
        vi.spyOn(claudeSettings, 'getClaudeConfigDir').mockReturnValue('/fake/café');

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/café'));
    });

    it('lets CLAUDE_SECURESTORAGE_CONFIG_DIR override the hash input, and an empty override forces the plain service', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';

        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = '/fake/secure';
        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/secure'));

        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = '';
        expect(getMacKeychainConfigDirService()).toBeNull();
    });
});
