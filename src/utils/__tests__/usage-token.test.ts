import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
    getUsageCredentials,
    getUsageLoginFingerprint,
    getUsageToken,
    parseMacKeychainCredentialCandidates
} from '../usage-fetch';

vi.mock('node:child_process', () => ({
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

// `security` exits 44 (errSecItemNotFound) for an item that isn't there
function makeMissingItemError(): Error {
    return Object.assign(new Error('The specified item could not be found in the keychain.'), { status: 44 });
}

function makeTokenPayload(token: string, refreshToken?: string): string {
    return JSON.stringify({ claudeAiOauth: { accessToken: token, refreshToken } });
}

function makeExecFileTimeoutError(): Error & { code: string } {
    return Object.assign(new Error('child process failed'), { code: 'ETIMEDOUT' });
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
        vi.spyOn(os, 'userInfo').mockReturnValue({ username: 'testuser' } as unknown as os.UserInfo<string>);
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

    it('reads the OS-username account when the service-only lookup returns an item without an OAuth token', () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            const isCredentialsService = args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials';
            if (isCredentialsService && args.includes('-a') && args[args.indexOf('-a') + 1] === 'testuser') {
                return makeTokenPayload('account-token', 'account-refresh-token');
            }

            if (isCredentialsService) {
                // Service-only match: an unrelated account's MCP-only item.
                return JSON.stringify({ mcpOAuth: { some: 'value' } });
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageCredentials()).toEqual({
            accessToken: 'account-token',
            refreshToken: 'account-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -w',
            'find-generic-password -s Claude Code-credentials -a testuser -w'
        ]);
    });

    it('skips the OS-username account read when the username cannot be resolved', () => {
        // os.userInfo() throws when the uid has no passwd entry (some containers).
        vi.spyOn(os, 'userInfo').mockImplementation(() => {
            throw new Error('no passwd entry');
        });
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                throw makeMissingItemError();
            }

            if (args[0] === 'dump-keychain') {
                return '';
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -w',
            'dump-keychain'
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
                throw makeMissingItemError();
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
            'find-generic-password -s Claude Code-credentials -a testuser -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-new -w',
            'find-generic-password -s Claude Code-credentials -w',
            'find-generic-password -s Claude Code-credentials -a testuser -w',
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
                throw makeMissingItemError();
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
            'find-generic-password -s Claude Code-credentials -a testuser -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-hashed -w',
            'find-generic-password -s Claude Code-credentials -w',
            'find-generic-password -s Claude Code-credentials -a testuser -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-hashed -w'
        ]);
    });

    it('bounds every macOS keychain read with a timeout', () => {
        const dump = makeKeychainBlock('Claude Code-credentials-hashed', { quoted: '20240301010101Z' });

        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'dump-keychain') {
                return dump;
            }

            if (command === 'security' && args?.[2] === 'Claude Code-credentials') {
                throw makeMissingItemError();
            }

            throw new Error('security timed out');
        });

        expect(getUsageToken()).toBeNull();
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -w',
            'find-generic-password -s Claude Code-credentials -a testuser -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-hashed -w'
        ]);
        // A blocked `security` (e.g. waiting on a keychain unlock prompt)
        // must not hold the status line until someone answers it.
        for (const call of mockedExecFileSync.mock.calls) {
            expect(call[2]).toEqual(expect.objectContaining({ timeout: 5000 }));
        }
    });

    it.each([
        [
            'the item read times out',
            'find-generic-password -s Claude Code-credentials -w',
            Object.assign(new Error('spawnSync security ETIMEDOUT'), { code: 'ETIMEDOUT', signal: 'SIGTERM', status: null })
        ],
        [
            'the keychain dump finds it locked',
            'dump-keychain',
            Object.assign(new Error('User interaction is not allowed.'), { status: 36 })
        ],
        [
            'a suffixed item read is refused',
            'find-generic-password -s Claude Code-credentials-new -w',
            Object.assign(new Error('The user name or passphrase you entered is not correct.'), { status: 51 })
        ]
    ])('stops the macOS keychain lookup when %s, then reads the credentials file', (_label, failingCall, failure) => {
        const dump = [
            makeKeychainBlock('Claude Code-credentials-new', { quoted: '20240301010101Z' }),
            makeKeychainBlock('Claude Code-credentials-old', { quoted: '20240201010101Z' })
        ].join('\n');
        const chain = [
            'find-generic-password -s Claude Code-credentials -w',
            'find-generic-password -s Claude Code-credentials -a testuser -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-new -w',
            'find-generic-password -s Claude Code-credentials-old -w'
        ];

        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            if (args.join(' ') === failingCall) {
                throw failure;
            }

            if (args[0] === 'dump-keychain') {
                return dump;
            }

            throw makeMissingItemError();
        });

        // Only a missing item moves on to the next keychain call. Any other
        // failure would meet every later call too, each one another request
        // for securityd to answer.
        expect(getUsageToken()).toBe('file-token');
        expect(getSecurityCallLog()).toEqual(chain.slice(0, chain.indexOf(failingCall) + 1));
    });

    it.each(['service-only', 'username'] as const)('stops macOS keychain probes after the %s lookup times out', (timeoutPosition) => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token', 'file-refresh-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                if (timeoutPosition === 'username' && !args.includes('-a')) {
                    return JSON.stringify({ mcpOAuth: {} });
                }
                throw makeExecFileTimeoutError();
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageCredentials()).toEqual({
            accessToken: 'file-token',
            refreshToken: 'file-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual(timeoutPosition === 'service-only'
            ? ['find-generic-password -s Claude Code-credentials -w']
            : [
                'find-generic-password -s Claude Code-credentials -w',
                'find-generic-password -s Claude Code-credentials -a testuser -w'
            ]);
    });

    it('stops trying macOS keychain candidates after one times out', () => {
        const dump = [
            makeKeychainBlock('Claude Code-credentials-new', { quoted: '20240301010101Z' }),
            makeKeychainBlock('Claude Code-credentials-old', { quoted: '20240201010101Z' })
        ].join('\n');

        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command !== 'security' || !args) {
                throw new Error(`Unexpected security args: ${args?.join(' ')}`);
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                throw makeMissingItemError();
            }

            if (args[0] === 'dump-keychain') {
                return dump;
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials-new') {
                throw makeExecFileTimeoutError();
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getSecurityCallLog()).toEqual([
            'find-generic-password -s Claude Code-credentials -w',
            'find-generic-password -s Claude Code-credentials -a testuser -w',
            'dump-keychain',
            'find-generic-password -s Claude Code-credentials-new -w'
        ]);
    });

    it.each(['linux', 'win32'] as const)('uses the credentials file on %s', (platform) => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
        mockCredentialsFile(makeTokenPayload('file-token'));

        expect(getUsageToken()).toBe('file-token');
        expect(getUsageToken()).toBe('file-token');
        expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('reads the CLAUDE_CONFIG_DIR keychain service first and skips the plain service on a hit', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile();
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === configDirService) {
                return makeTokenPayload('profile-token', 'profile-refresh-token');
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('profile-token');
        expect(getUsageCredentials()).toEqual({
            accessToken: 'profile-token',
            refreshToken: 'profile-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -w`,
            `find-generic-password -s ${configDirService} -w`
        ]);
    });

    it('uses only the current profile file after its Keychain service times out', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('profile-file-token', 'profile-file-refresh-token'));
        mockedExecFileSync.mockImplementation(() => {
            throw makeExecFileTimeoutError();
        });

        expect(getUsageCredentials()).toEqual({
            accessToken: 'profile-file-token',
            refreshToken: 'profile-file-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -w`
        ]);
    });

    it('skips other profiles\' keychain items and uses the profile\'s credentials file when its entry is missing', () => {
        const configDirService = makeConfigDirService('/fake/claude');

        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
        mockCredentialsFile(makeTokenPayload('file-token', 'file-refresh-token'));
        mockedExecFileSync.mockImplementation((command: string, args?: string[]) => {
            if (command === 'security' && args?.[0] === 'find-generic-password' && args[2] === configDirService) {
                throw makeMissingItemError();
            }

            throw new Error(`Unexpected security args: ${args?.join(' ')}`);
        });

        expect(getUsageToken()).toBe('file-token');
        expect(getUsageCredentials()).toEqual({
            accessToken: 'file-token',
            refreshToken: 'file-refresh-token'
        });
        expect(getSecurityCallLog()).toEqual([
            `find-generic-password -s ${configDirService} -w`,
            `find-generic-password -s ${configDirService} -w`
        ]);
    });
});

describe('getUsageLoginFingerprint', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(claudeSettings, 'getClaudeConfigDir').mockReturnValue('/fake/claude');
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Claude Code reissues the access token every few hours; /login brings a
    // new refresh token
    it('stays the same across an access-token refresh, and changes with the login', () => {
        mockCredentialsFile(makeTokenPayload('access-1', 'refresh-1'));
        const login = getUsageLoginFingerprint();
        mockCredentialsFile(makeTokenPayload('access-2', 'refresh-1'));
        const refreshed = getUsageLoginFingerprint();
        mockCredentialsFile(makeTokenPayload('access-3', 'refresh-2'));
        const otherLogin = getUsageLoginFingerprint();

        expect(login).toBe(createHash('sha256').update('refresh-1').digest('hex').slice(0, 16));
        expect(refreshed).toBe(login);
        expect(otherLogin).not.toBe(login);
    });
});

describe('getMacKeychainConfigDirService', () => {
    it('returns null for the default profile', () => {
        expect(getMacKeychainConfigDirService()).toBeNull();
    });

    it('suffixes the service with the first 8 hex chars of sha256(config dir) when CLAUDE_CONFIG_DIR is set', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/claude'));
    });

    it('hashes the raw environment value without resolving it, matching Claude Code', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude-work/';

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/claude-work/'));
    });

    it('NFC-normalizes the directory before hashing, matching Claude Code', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/cafe\u0301';

        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/caf\u00e9'));
    });

    it('lets CLAUDE_SECURESTORAGE_CONFIG_DIR override the hash input, and an empty override forces the plain service', () => {
        process.env.CLAUDE_CONFIG_DIR = '/fake/claude';

        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = '/fake/secure';
        expect(getMacKeychainConfigDirService()).toBe(makeConfigDirService('/fake/secure'));

        process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = '';
        expect(getMacKeychainConfigDirService()).toBeNull();
    });
});
