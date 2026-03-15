import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    describe,
    expect,
    it
} from 'vitest';

import { parseMacKeychainCredentialCandidates } from '../usage-fetch';

interface TokenHome {
    bin: string;
    claudeConfig: string;
    home: string;
    logFile: string;
}

interface TokenProbeOptions {
    candidatePayloads?: Record<string, string>;
    dump?: string;
    dumpPaddingLines?: number;
    exactPayload?: string;
    platform: NodeJS.Platform;
    tokenHome: TokenHome;
}

interface TokenProbeResult {
    first: string | null;
    second: string | null;
    securityLog: string[];
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

function createTokenHarness() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-token-test-'));
    const probeScriptPath = path.join(tempRoot, 'probe-token.mjs');
    const usageFetchModulePath = fileURLToPath(new URL('../usage-fetch.ts', import.meta.url));

    const probeScript = `
import * as fs from 'fs';

if (process.env.TEST_PLATFORM) {
    Object.defineProperty(process, 'platform', {
        configurable: true,
        value: process.env.TEST_PLATFORM
    });
}

const { getUsageToken } = await import(${JSON.stringify(usageFetchModulePath)});

const first = getUsageToken();
const second = getUsageToken();
const logFile = process.env.TEST_SECURITY_LOG_FILE;

process.stdout.write(JSON.stringify({
    first,
    second,
    securityLog: logFile && fs.existsSync(logFile)
        ? fs.readFileSync(logFile, 'utf8').split(/\\r?\\n/).filter(Boolean)
        : []
}));
`;

    const securityScript = `#!/usr/bin/env node
const fs = require('fs');

const args = process.argv.slice(2);
const logFile = process.env.TEST_SECURITY_LOG_FILE;
if (logFile) {
    fs.appendFileSync(logFile, args.join(' ') + '\\n');
}

if (args[0] === 'dump-keychain') {
    const paddingLines = Number.parseInt(process.env.TEST_SECURITY_DUMP_PADDING_LINES || '0', 10);
    let remainingPaddingLines = paddingLines;
    while (remainingPaddingLines > 0) {
        const chunkSize = Math.min(remainingPaddingLines, 1024);
        fs.writeSync(process.stdout.fd, 'ignored\\n'.repeat(chunkSize));
        remainingPaddingLines -= chunkSize;
    }
    fs.writeSync(process.stdout.fd, process.env.TEST_SECURITY_DUMP || '');
    process.exit(0);
}

if (args[0] !== 'find-generic-password') {
    process.exit(44);
}

const serviceIndex = args.indexOf('-s');
const service = serviceIndex >= 0 ? args[serviceIndex + 1] : '';
const exactPayload = process.env.TEST_SECURITY_EXACT_PAYLOAD;
const candidatePayloads = JSON.parse(process.env.TEST_SECURITY_CANDIDATE_PAYLOADS_JSON || '{}');

if (service === 'Claude Code-credentials') {
    if (exactPayload === undefined || exactPayload === '__MISSING__') {
        process.exit(44);
    }

    fs.writeSync(process.stdout.fd, exactPayload);
    process.exit(0);
}

if (Object.prototype.hasOwnProperty.call(candidatePayloads, service)) {
    fs.writeSync(process.stdout.fd, candidatePayloads[service]);
    process.exit(0);
}

process.exit(44);
`;

    fs.writeFileSync(probeScriptPath, probeScript);

    function createTokenHome(name: string, fileToken?: string): TokenHome {
        const home = path.join(tempRoot, `home-${name}`);
        const bin = path.join(tempRoot, `bin-${name}`);
        const claudeConfig = path.join(tempRoot, `claude-${name}`);
        const logFile = path.join(tempRoot, `security-${name}.log`);
        const securityPath = path.join(bin, 'security');

        fs.mkdirSync(home, { recursive: true });
        fs.mkdirSync(bin, { recursive: true });
        fs.mkdirSync(claudeConfig, { recursive: true });
        fs.writeFileSync(securityPath, securityScript);
        fs.chmodSync(securityPath, 0o755);

        if (fileToken) {
            fs.writeFileSync(
                path.join(claudeConfig, '.credentials.json'),
                makeTokenPayload(fileToken)
            );
        }

        return {
            bin,
            claudeConfig,
            home,
            logFile
        };
    }

    function runTokenProbe(options: TokenProbeOptions): TokenProbeResult {
        const output = execFileSync(process.execPath, [probeScriptPath], {
            encoding: 'utf8',
            env: {
                ...process.env,
                CLAUDE_CONFIG_DIR: options.tokenHome.claudeConfig,
                HOME: options.tokenHome.home,
                PATH: `${options.tokenHome.bin}${path.delimiter}${process.env.PATH ?? ''}`,
                TEST_PLATFORM: options.platform,
                TEST_SECURITY_CANDIDATE_PAYLOADS_JSON: JSON.stringify(options.candidatePayloads ?? {}),
                TEST_SECURITY_DUMP: options.dump ?? '',
                TEST_SECURITY_DUMP_PADDING_LINES: String(options.dumpPaddingLines ?? 0),
                TEST_SECURITY_EXACT_PAYLOAD: options.exactPayload ?? '__MISSING__',
                TEST_SECURITY_LOG_FILE: options.tokenHome.logFile
            }
        });

        return JSON.parse(output) as TokenProbeResult;
    }

    function cleanup(): void {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    return {
        cleanup,
        createTokenHome,
        runTokenProbe
    };
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
    it('prefers the exact macOS keychain service over hashed fallbacks and files', () => {
        const harness = createTokenHarness();

        try {
            const tokenHome = harness.createTokenHome('exact', 'file-token');
            const result = harness.runTokenProbe({
                exactPayload: makeTokenPayload('exact-token'),
                platform: 'darwin',
                tokenHome
            });

            expect(result.first).toBe('exact-token');
            expect(result.second).toBe('exact-token');
            expect(result.securityLog).toEqual([
                'find-generic-password -s Claude Code-credentials -w',
                'find-generic-password -s Claude Code-credentials -w'
            ]);
        } finally {
            harness.cleanup();
        }
    });

    it('tries the newest hashed macOS keychain candidate after an exact miss', () => {
        const harness = createTokenHarness();

        try {
            const tokenHome = harness.createTokenHome('hashed');
            const dump = [
                makeKeychainBlock('Claude Code-credentials-old', { quoted: '20240201010101Z' }),
                makeKeychainBlock('Claude Code-credentials-new', { quoted: '20240301010101Z' })
            ].join('\n');
            const result = harness.runTokenProbe({
                candidatePayloads: { 'Claude Code-credentials-new': makeTokenPayload('hashed-token') },
                dump,
                platform: 'darwin',
                tokenHome
            });

            expect(result.first).toBe('hashed-token');
            expect(result.second).toBe('hashed-token');
            expect(result.securityLog).toEqual([
                'find-generic-password -s Claude Code-credentials -w',
                'dump-keychain',
                'find-generic-password -s Claude Code-credentials-new -w',
                'find-generic-password -s Claude Code-credentials -w',
                'dump-keychain',
                'find-generic-password -s Claude Code-credentials-new -w'
            ]);
        } finally {
            harness.cleanup();
        }
    });

    it('falls back to ~/.claude/.credentials.json on macOS when keychain lookups miss or parse invalid data', () => {
        const harness = createTokenHarness();

        try {
            const tokenHome = harness.createTokenHome('file-fallback', 'file-token');
            const dump = makeKeychainBlock('Claude Code-credentials-hashed', { quoted: '20240301010101Z' });
            const result = harness.runTokenProbe({
                candidatePayloads: { 'Claude Code-credentials-hashed': 'not-json' },
                dump,
                platform: 'darwin',
                tokenHome
            });

            expect(result.first).toBe('file-token');
            expect(result.second).toBe('file-token');
            expect(result.securityLog).toEqual([
                'find-generic-password -s Claude Code-credentials -w',
                'dump-keychain',
                'find-generic-password -s Claude Code-credentials-hashed -w',
                'find-generic-password -s Claude Code-credentials -w',
                'dump-keychain',
                'find-generic-password -s Claude Code-credentials-hashed -w'
            ]);
        } finally {
            harness.cleanup();
        }
    });

    it('uses the credentials file on non-macOS', () => {
        const harness = createTokenHarness();

        try {
            const tokenHome = harness.createTokenHome('linux', 'linux-file-token');
            const result = harness.runTokenProbe({
                platform: 'linux',
                tokenHome
            });

            expect(result.first).toBe('linux-file-token');
            expect(result.second).toBe('linux-file-token');
            expect(result.securityLog).toEqual([]);
        } finally {
            harness.cleanup();
        }
    });
});