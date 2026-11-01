import type * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    __testing,
    parseUsageApiResponse
} from '../usage-fetch';
import { WEEKLY_MODEL_USAGE_BUCKETS } from '../usage-types';

import {
    startStalledProxy,
    type StalledProxy
} from './proxy-test-helpers';

const require = createRequire(import.meta.url);
const { execFileSync: realExecFileSync } = require('node:child_process') as { execFileSync: typeof childProcess.execFileSync };

interface UsageProbeResult {
    renderedEmail: string | null;
    first: Record<string, unknown>;
    second: Record<string, unknown>;
    staleFallback: [boolean, boolean];
    lockExists: boolean;
    cacheExists: boolean;
    requestCount: number;
    proxyAgentConfigured: boolean;
    requestHost: string | null;
    requestPath: string | null;
    requestAuthorization: string | null;
    homedir: string;
    lockContents: string | null;
    securityCalls: string[];
    fetchedAtMs: number | null;
}

interface TokenHome {
    bin: string;
    claudeConfig: string;
    home: string;
}

interface ProbeOptions {
    claudeConfigDir?: string;
    claudeSecureStorageConfigDir?: string;
    home: string;
    httpsProxy?: string;
    lockWrittenDuringRequest?: string;
    lowercaseHttpsProxy?: string;
    noProxy?: string;
    mode?: 'error' | 'status' | 'success' | 'unexpected';
    nowMs: number;
    pathDir?: string;
    requiredFields?: string[];
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    statusCode?: number;
    // What each of the probe's two calls runs: fetchUsageData (the default)
    // or fetchAccountEmail, whose status also drives the real email widget.
    target?: 'account-email' | 'usage';
}

function createProbeHarness() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-usage-test-'));
    const probeScriptPath = path.join(tempRoot, 'probe-usage.mjs');
    const usageModulePath = fileURLToPath(new URL('../usage.ts', import.meta.url));

    const probeScript = `
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const https = require('node:https');
const mode = process.env.TEST_REQUEST_MODE || 'success';
const responseBody = process.env.TEST_RESPONSE_BODY || '';
const responseHeaders = JSON.parse(process.env.TEST_RESPONSE_HEADERS_JSON || '{}');
const statusCode = Number(process.env.TEST_STATUS_CODE || (mode === 'success' ? '200' : '500'));
let requestCount = 0;
let proxyAgentConfigured = false;
let requestHost = null;
let requestPath = null;
let requestAuthorization = null;

https.request = (...args) => {
    requestCount += 1;
    const callback = args.find(value => typeof value === 'function');
    const options = args.find(value => value && typeof value === 'object' && !Buffer.isBuffer(value));
    proxyAgentConfigured = Boolean(options?.agent);
    requestHost = options?.hostname ?? null;
    requestPath = options?.path ?? null;
    requestAuthorization = options?.headers?.Authorization ?? null;
    const requestHandlers = new Map();
    const responseHandlers = new Map();

    const response = {
        headers: responseHeaders,
        statusCode,
        setEncoding() {},
        on(event, handler) {
            const existing = responseHandlers.get(event) || [];
            existing.push(handler);
            responseHandlers.set(event, existing);
            return response;
        }
    };

    const request = {
        on(event, handler) {
            const existing = requestHandlers.get(event) || [];
            existing.push(handler);
            requestHandlers.set(event, existing);
            return request;
        },
        destroy() {},
        end() {
            // Simulates a concurrent render replacing the lock while this
            // request is in flight.
            if (process.env.TEST_LOCK_DURING_REQUEST) {
                fs.writeFileSync(lockFile, process.env.TEST_LOCK_DURING_REQUEST);
            }

            if (mode === 'error') {
                const handlers = requestHandlers.get('error') || [];
                for (const handler of handlers) {
                    handler(new Error('mock request failure'));
                }
                return;
            }

            if (mode === 'unexpected') {
                const handlers = requestHandlers.get('error') || [];
                for (const handler of handlers) {
                    handler(new Error('unexpected request'));
                }
                return;
            }

            if (callback) {
                callback(response);
            }

            if (responseBody !== '') {
                const dataHandlers = responseHandlers.get('data') || [];
                for (const handler of dataHandlers) {
                    handler(responseBody);
                }
            }

            const endHandlers = responseHandlers.get('end') || [];
            for (const handler of endHandlers) {
                handler();
            }
        }
    };

    return request;
};

const { fetchAccountEmail, fetchUsageData, getUsageFetchedAtMs, isStaleUsageFallback } = await import(${JSON.stringify(usageModulePath)});

const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const configHash = createHash('sha256').update(path.resolve(configDir)).digest('hex').slice(0, 16);
const lockFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage-' + configHash + '.lock');
const cacheFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage-' + configHash + '.json');
const securityCallsFile = path.join(os.homedir(), 'security-calls.jsonl');
const nowMs = Number(process.env.TEST_NOW_MS || Date.now());
const requiredFields = JSON.parse(process.env.TEST_REQUIRED_FIELDS_JSON || '[]');
Date.now = () => nowMs;

const fetchOnce = process.env.TEST_PROBE_TARGET === 'account-email'
    ? () => fetchAccountEmail()
    : () => fetchUsageData({ requiredFields });
const first = await fetchOnce();
const second = await fetchOnce();
let renderedEmail = null;
if (process.env.TEST_PROBE_TARGET === 'account-email') {
    const { ClaudeAccountEmailWidget } = await import(${JSON.stringify(fileURLToPath(new URL('../../widgets/ClaudeAccountEmail.ts', import.meta.url)))});
    const { DEFAULT_SETTINGS } = await import(${JSON.stringify(fileURLToPath(new URL('../../types/Settings.ts', import.meta.url)))});
    renderedEmail = new ClaudeAccountEmailWidget().render(
        { id: 'email', type: 'claude-account-email' },
        { accountEmail: first },
        DEFAULT_SETTINGS
    );
}
process.stdout.write(JSON.stringify({
    renderedEmail,
    first,
    second,
    staleFallback: [isStaleUsageFallback(first), isStaleUsageFallback(second)],
    lockExists: fs.existsSync(lockFile),
    cacheExists: fs.existsSync(cacheFile),
    requestCount,
    proxyAgentConfigured,
    requestHost,
    requestPath,
    requestAuthorization,
    homedir: os.homedir(),
    lockContents: fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : null,
    securityCalls: fs.existsSync(securityCallsFile)
        ? fs.readFileSync(securityCallsFile, 'utf8').trim().split('\\n').filter(Boolean)
        : [],
    fetchedAtMs: getUsageFetchedAtMs() ?? null
}));
`;

    fs.writeFileSync(probeScriptPath, probeScript);

    function createEmptyHome(name: string): { home: string } {
        const home = path.join(tempRoot, `home-${name}`);
        fs.mkdirSync(home, { recursive: true });
        return { home };
    }

    function createTokenHome(name: string): TokenHome {
        const home = path.join(tempRoot, `home-${name}`);
        const bin = path.join(tempRoot, `bin-${name}`);
        const claudeConfig = path.join(tempRoot, `claude-${name}`);
        const securityScript = path.join(bin, 'security');
        const credentialsFile = path.join(claudeConfig, '.credentials.json');

        fs.mkdirSync(home, { recursive: true });
        fs.mkdirSync(bin, { recursive: true });
        fs.mkdirSync(claudeConfig, { recursive: true });

        // Keep the macOS Keychain stub in sync with credential changes made by
        // the tests, so every platform exercises the same login and tokens.
        fs.writeFileSync(securityScript, '#!/bin/sh\n/bin/cat "$CLAUDE_CONFIG_DIR/.credentials.json"\n');
        fs.chmodSync(securityScript, 0o755);
        fs.writeFileSync(credentialsFile, JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } }));

        return {
            bin,
            claudeConfig,
            home
        };
    }

    function createTimedOutSecurityHome(name: string): TokenHome {
        const tokenHome = createTokenHome(name);
        const securityScript = path.join(tokenHome.bin, 'security');

        fs.writeFileSync(securityScript, [
            '#!/bin/sh',
            'printf \'%s\\n\' "$*" >> "$HOME/security-calls.jsonl"',
            'case "$*" in',
            '  "find-generic-password -s Claude Code-credentials -w"|"find-generic-password -s Claude Code-credentials-"*" -w")',
            '    child=""',
            '    trap \'[ -z "$child" ] || kill "$child" 2>/dev/null; printf "terminated\\\\n" > "$HOME/security-timeout.txt"; exit 143\' TERM',
            '    /bin/sleep 10 &',
            '    child=$!',
            '    wait "$child"',
            '    ;;',
            '  "dump-keychain") echo "keychain: fake";;',
            '  *) echo "unexpected fake security call: $*" >&2; exit 2 ;;',
            'esac'
        ].join('\n'));
        fs.chmodSync(securityScript, 0o755);

        return tokenHome;
    }

    function runProbe(options: ProbeOptions): UsageProbeResult {
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
            const normalizedKey = key.toUpperCase();
            return normalizedKey !== 'CLAUDE_CONFIG_DIR'
                && normalizedKey !== 'CLAUDE_SECURESTORAGE_CONFIG_DIR'
                && normalizedKey !== 'HTTPS_PROXY'
                && normalizedKey !== 'NO_PROXY';
        }));

        Object.assign(env, {
            HOME: options.home,
            // os.homedir() prefers USERPROFILE on Windows; inheriting the
            // real one lets the probe escape into the user's actual home
            // and read/write the live ~/.cache/ccstatusline
            USERPROFILE: options.home,
            PATH: options.pathDir ?? '/nonexistent',
            TEST_REQUIRED_FIELDS_JSON: JSON.stringify(options.requiredFields ?? []),
            TEST_NOW_MS: String(options.nowMs),
            TEST_REQUEST_MODE: options.mode ?? 'success',
            TEST_RESPONSE_BODY: options.responseBody ?? '',
            TEST_RESPONSE_HEADERS_JSON: JSON.stringify(options.responseHeaders ?? {}),
            TEST_STATUS_CODE: String(options.statusCode ?? (options.mode === 'success' ? 200 : 500)),
            TEST_PROBE_TARGET: options.target ?? 'usage'
        });

        if (options.claudeConfigDir !== undefined) {
            env.CLAUDE_CONFIG_DIR = options.claudeConfigDir;
        }

        if (options.claudeSecureStorageConfigDir !== undefined) {
            env.CLAUDE_SECURESTORAGE_CONFIG_DIR = options.claudeSecureStorageConfigDir;
        }

        if (options.httpsProxy !== undefined) {
            env.HTTPS_PROXY = options.httpsProxy;
        }

        if (options.lockWrittenDuringRequest !== undefined) {
            env.TEST_LOCK_DURING_REQUEST = options.lockWrittenDuringRequest;
        }

        if (options.lowercaseHttpsProxy !== undefined) {
            env.https_proxy = options.lowercaseHttpsProxy;
        }

        if (options.noProxy !== undefined) {
            env.NO_PROXY = options.noProxy;
        }

        const output = realExecFileSync(process.execPath, [probeScriptPath], {
            encoding: 'utf8',
            env
        });

        const result = JSON.parse(output) as UsageProbeResult;

        // A probe resolving a different home has escaped its sandbox and would
        // read or write the real user's ~/.cache/ccstatusline
        expect(result.homedir).toBe(options.home);

        return result;
    }

    function cleanup(): void {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    return {
        cleanup,
        createEmptyHome,
        createTimedOutSecurityHome,
        createTokenHome,
        runProbe
    };
}

function parseLockContents(lockContents: string | null): { blockedUntil: number; error?: string } | null {
    return lockContents ? JSON.parse(lockContents) as { blockedUntil: number; error?: string } : null;
}

// createTokenHome writes an access-token-only credentials file; these tests
// need a refresh token alongside it to exercise the account fingerprint.
function writeUsageCredentials(claudeConfig: string, claudeAiOauth: { accessToken: string; refreshToken?: string }): void {
    fs.writeFileSync(path.join(claudeConfig, '.credentials.json'), JSON.stringify({ claudeAiOauth }));
}

function usageFilePath(profile: TokenHome, suffix: 'json' | 'lock' | 'credentials.lock'): string {
    const hash = createHash('sha256').update(path.resolve(profile.claudeConfig)).digest('hex').slice(0, 16);
    return path.join(profile.home, '.cache', 'ccstatusline', `usage-${hash}.${suffix}`);
}

function seedUsageCache(profile: TokenHome, contents: Record<string, unknown>): { cacheFile: string; mtimeMs: number } {
    const cacheDir = path.join(profile.home, '.cache', 'ccstatusline');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = usageFilePath(profile, 'json');
    fs.writeFileSync(cacheFile, JSON.stringify(contents));
    return { cacheFile, mtimeMs: fs.statSync(cacheFile).mtimeMs };
}

describe('fetchUsageData error handling', () => {
    // Before the fixtures' 2030 resets, so their cached windows are still open
    const nowMs = 1800000000000;
    const successResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-01-07T00:00:00.000Z'
        }
    });
    const unusedFableQuotaResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-01-07T00:00:00.000Z'
        },
        limits: [
            { kind: 'weekly_scoped', percent: 0, resets_at: null, scope: { model: { display_name: 'Claude 3.5 Fable' } } }
        ]
    });
    const updatedSuccessResponseBody = JSON.stringify({
        five_hour: {
            utilization: 55,
            resets_at: '2030-01-02T00:00:00.000Z'
        },
        seven_day: {
            utilization: 21,
            resets_at: '2030-01-08T00:00:00.000Z'
        }
    });
    const perModelSuccessResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-01-07T00:00:00.000Z'
        },
        seven_day_sonnet: {
            utilization: 8,
            resets_at: '2030-01-07T00:00:00.000Z'
        }
    });
    const nullPerModelResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-01-07T00:00:00.000Z'
        },
        seven_day_sonnet: null,
        seven_day_opus: null
    });
    const cohortResponseBody = JSON.stringify({
        five_hour: {
            utilization: 52,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: null,
        seven_day_oauth_apps: null,
        seven_day_sonnet: null,
        seven_day_opus: null,
        seven_day_cowork: null,
        seven_day_omelette: {
            utilization: 0,
            resets_at: null
        },
        tangelo: null,
        iguana_necktie: null,
        omelette_promotional: null,
        extra_usage: {
            is_enabled: false,
            monthly_limit: null,
            used_credits: null,
            utilization: null,
            currency: null,
            disabled_reason: null
        }
    });
    const extraUsageResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-01-07T00:00:00.000Z'
        },
        extra_usage: {
            is_enabled: true,
            monthly_limit: 400000,
            used_credits: 10600,
            utilization: 2.6,
            currency: 'EUR'
        }
    });
    const noLimitExtraUsageResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-01-07T00:00:00.000Z'
        },
        extra_usage: {
            is_enabled: true,
            monthly_limit: null,
            used_credits: 542,
            utilization: null,
            disabled_reason: null
        }
    });
    // Mirrors a real Enterprise-account response: every rate-limit window is
    // null because Enterprise plans have no 5-hour/7-day windows (#343).
    const enterpriseNullWindowsResponseBody = JSON.stringify({
        five_hour: null,
        seven_day: null,
        seven_day_oauth_apps: null,
        seven_day_sonnet: null,
        seven_day_opus: null,
        extra_usage: {
            is_enabled: true,
            monthly_limit: 50000,
            used_credits: 0,
            utilization: null,
            currency: 'USD',
            disabled_reason: null
        }
    });
    const rateLimitedResponseBody = JSON.stringify({
        error: {
            message: 'Rate limited. Please try again later.',
            type: 'rate_limit_error'
        }
    });

    // The request carries the account's bearer token, so a host the user kept
    // off the proxy must stay off it
    it('keeps fresh usage caches separate for two profiles sharing one home and token', () => {
        const harness = createProbeHarness();
        try {
            const first = harness.createTokenHome('cache-first');
            const second = { ...harness.createTokenHome('cache-second'), home: first.home };
            const render = (profile: TokenHome, body: string, time: number, mode: ProbeOptions['mode'] = 'success') => harness.runProbe({
                home: profile.home,
                claudeConfigDir: profile.claudeConfig,
                pathDir: profile.bin,
                nowMs: time,
                mode,
                responseBody: body
            });

            expect(render(first, successResponseBody, nowMs).requestCount).toBe(1);
            const freshNow = fs.statSync(usageFilePath(first, 'json')).mtimeMs + 1000;
            expect(render(second, updatedSuccessResponseBody, freshNow).requestCount).toBe(1);
            const firstCached = render(first, '', freshNow, 'unexpected');
            const secondCached = render(second, '', freshNow, 'unexpected');
            expect(firstCached.first.sessionUsage).toBe(42);
            expect(secondCached.first.sessionUsage).toBe(55);
            expect(firstCached.requestCount).toBe(0);
            expect(secondCached.requestCount).toBe(0);
            expect(fs.existsSync(usageFilePath(first, 'lock'))).toBe(false);
            expect(fs.existsSync(usageFilePath(second, 'lock'))).toBe(false);
        } finally {
            harness.cleanup();
        }
    });

    it.each(['error', 'status'] as const)('isolates %s backoff, stale caches, and lock cleanup across profiles sharing one home', (mode) => {
        const harness = createProbeHarness();
        try {
            const first = harness.createTokenHome('lock-first');
            const second = { ...harness.createTokenHome('lock-second'), home: first.home };
            const tokenHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
            const seeded = seedUsageCache(first, { sessionUsage: 11, tokenHash });
            const refreshNow = seeded.mtimeMs + 240000;
            const render = (profile: TokenHome, requestMode: ProbeOptions['mode'], time = refreshNow) => harness.runProbe({
                home: profile.home,
                claudeConfigDir: profile.claudeConfig,
                pathDir: profile.bin,
                nowMs: time,
                mode: requestMode,
                statusCode: requestMode === 'status' ? 429 : 200,
                responseHeaders: { 'retry-after': '300' },
                responseBody: updatedSuccessResponseBody
            });

            const failed = render(first, mode);
            expect(failed.first.sessionUsage).toBe(11);
            expect(failed.requestCount).toBe(1);
            expect(failed.staleFallback).toEqual([true, true]);
            const firstLock = fs.readFileSync(usageFilePath(first, 'lock'), 'utf8');
            expect(parseLockContents(firstLock)?.error).toBe(mode === 'status' ? 'rate-limited' : 'timeout');

            const other = render(second, 'success');
            expect(other.first.sessionUsage).toBe(55);
            expect(other.requestCount).toBe(1);
            expect(other.lockExists).toBe(false);
            expect(fs.readFileSync(usageFilePath(first, 'lock'), 'utf8')).toBe(firstLock);
            const stillBlocked = render(first, 'unexpected', refreshNow + 1000);
            expect(stillBlocked.first.sessionUsage).toBe(11);
            expect(stillBlocked.requestCount).toBe(0);
            expect(stillBlocked.staleFallback).toEqual([true, true]);
        } finally {
            harness.cleanup();
        }
    });

    it('preserves both profiles\' no-credentials backoffs when their misses alternate in one home', () => {
        const harness = createProbeHarness();
        try {
            const first = harness.createTokenHome('credential-lock-first');
            const second = { ...harness.createTokenHome('credential-lock-second'), home: first.home };
            const render = (profile: TokenHome, time: number) => harness.runProbe({
                home: profile.home,
                claudeConfigDir: profile.claudeConfig,
                pathDir: profile.bin,
                nowMs: time,
                mode: 'success',
                responseBody: successResponseBody
            });
            for (const profile of [first, second]) {
                fs.rmSync(path.join(profile.claudeConfig, '.credentials.json'));
                expect(render(profile, nowMs).first).toEqual({ error: 'no-credentials' });
            }
            for (const profile of [first, second]) {
                writeUsageCredentials(profile.claudeConfig, { accessToken: 'test-token' });
                const blocked = render(profile, nowMs + 10000);
                expect(blocked.first).toEqual({ error: 'no-credentials' });
                expect(blocked.requestCount).toBe(0);
            }
            for (const profile of [first, second]) {
                expect(render(profile, nowMs + 31000).first.sessionUsage).toBe(42);
            }
        } finally {
            harness.cleanup();
        }
    });

    it.each([false, true])('ignores and preserves shared legacy files with a custom profile: %s', (customProfile) => {
        const harness = createProbeHarness();
        try {
            const initial = harness.createTokenHome('legacy-shared');
            const profile = customProfile ? initial : { ...initial, claudeConfig: path.join(initial.home, '.claude') };
            fs.mkdirSync(profile.claudeConfig, { recursive: true });
            writeUsageCredentials(profile.claudeConfig, { accessToken: 'test-token' });
            const cacheDir = path.join(profile.home, '.cache', 'ccstatusline');
            fs.mkdirSync(cacheDir, { recursive: true });
            const tokenHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
            const sourceService = customProfile
                ? `Claude Code-credentials-${createHash('sha256').update(profile.claudeConfig).digest('hex').slice(0, 8)}`
                : null;
            const files = {
                'usage.json': JSON.stringify({ sessionUsage: 99, tokenHash }),
                'usage.lock': JSON.stringify({ blockedUntil: Math.floor(nowMs / 1000) + 300, error: 'rate-limited' }),
                'usage-credentials.lock': JSON.stringify({
                    blockedUntil: Math.floor(nowMs / 1000) + 30,
                    source: JSON.stringify([sourceService, profile.claudeConfig])
                })
            };
            for (const [name, contents] of Object.entries(files)) {
                const file = path.join(cacheDir, name);
                fs.writeFileSync(file, contents);
                fs.utimesSync(file, nowMs / 1000, nowMs / 1000);
            }
            const result = harness.runProbe({
                home: profile.home,
                claudeConfigDir: customProfile ? profile.claudeConfig : undefined,
                mode: 'success',
                nowMs,
                responseBody: successResponseBody
            });
            expect(result.first.sessionUsage).toBe(42);
            expect(result.requestCount).toBe(1);
            expect(fs.existsSync(usageFilePath(profile, 'json'))).toBe(true);
            expect(result.lockExists).toBe(false);
            for (const [name, contents] of Object.entries(files)) {
                expect(fs.readFileSync(path.join(cacheDir, name), 'utf8')).toBe(contents);
            }
        } finally {
            harness.cleanup();
        }
    });

    it('connects directly when NO_PROXY lists api.anthropic.com', () => {
        const harness = createProbeHarness();

        try {
            const noProxyHome = harness.createTokenHome('no-proxy');

            const result = harness.runProbe({
                claudeConfigDir: noProxyHome.claudeConfig,
                home: noProxyHome.home,
                httpsProxy: 'http://proxy.local:8080',
                noProxy: 'localhost,.anthropic.com',
                mode: 'success',
                nowMs,
                pathDir: noProxyHome.bin,
                responseBody: successResponseBody
            });

            expect(result.first).toMatchObject({ sessionUsage: 42, weeklyUsage: 17 });
            expect(result.requestCount).toBe(1);
            expect(result.proxyAgentConfigured).toBe(false);
            expect(result.requestHost).toBe('api.anthropic.com');
            expect(result.requestPath).toBe('/api/oauth/usage');
        } finally {
            harness.cleanup();
        }
    });

    it('preserves root errors within a process and keeps existing proxy and cache behavior', () => {
        const harness = createProbeHarness();

        try {
            const noCredentialsHome = harness.createEmptyHome('no-credentials');
            const apiErrorHome = harness.createTokenHome('api-error');
            const successHome = harness.createTokenHome('success');
            const invalidProxyHome = harness.createTokenHome('invalid-proxy');
            const proxyHome = harness.createTokenHome('proxy');
            const blankProxyHome = harness.createTokenHome('blank-proxy');
            const lowercaseProxyHome = harness.createTokenHome('lowercase-proxy');

            const noCredentialsResult = harness.runProbe({
                home: noCredentialsHome.home,
                mode: 'unexpected',
                nowMs
            });

            expect(noCredentialsResult.first).toEqual({ error: 'no-credentials' });
            expect(noCredentialsResult.second).toEqual({ error: 'no-credentials' });
            expect(noCredentialsResult.lockExists).toBe(false);
            expect(noCredentialsResult.cacheExists).toBe(false);
            expect(noCredentialsResult.requestCount).toBe(0);
            expect(noCredentialsResult.proxyAgentConfigured).toBe(false);

            const apiErrorResult = harness.runProbe({
                claudeConfigDir: apiErrorHome.claudeConfig,
                home: apiErrorHome.home,
                mode: 'error',
                nowMs,
                pathDir: apiErrorHome.bin
            });

            expect(apiErrorResult.first).toEqual({ error: 'api-error' });
            expect(apiErrorResult.second).toEqual({ error: 'api-error' });
            expect(apiErrorResult.cacheExists).toBe(false);
            expect(apiErrorResult.requestCount).toBe(1);
            expect(apiErrorResult.proxyAgentConfigured).toBe(false);
            expect(apiErrorResult.requestHost).toBe('api.anthropic.com');
            expect(parseLockContents(apiErrorResult.lockContents)).toEqual({
                blockedUntil: Math.floor(nowMs / 1000) + 30,
                error: 'timeout'
            });

            const genericLockResult = harness.runProbe({
                claudeConfigDir: apiErrorHome.claudeConfig,
                home: apiErrorHome.home,
                mode: 'unexpected',
                nowMs,
                pathDir: apiErrorHome.bin
            });

            expect(genericLockResult.first).toEqual({ error: 'timeout' });
            expect(genericLockResult.second).toEqual({ error: 'timeout' });
            expect(genericLockResult.requestCount).toBe(0);

            const successResult = harness.runProbe({
                claudeConfigDir: successHome.claudeConfig,
                home: successHome.home,
                mode: 'success',
                nowMs,
                pathDir: successHome.bin,
                responseBody: successResponseBody
            });

            expect(successResult.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(successResult.second).toEqual(successResult.first);
            expect(successResult.cacheExists).toBe(true);
            expect(successResult.requestCount).toBe(1);
            expect(successResult.proxyAgentConfigured).toBe(false);
            expect(successResult.requestHost).toBe('api.anthropic.com');

            const httpsProxyResult = harness.runProbe({
                claudeConfigDir: proxyHome.claudeConfig,
                home: proxyHome.home,
                httpsProxy: 'http://proxy.local:8080',
                mode: 'success',
                nowMs,
                pathDir: proxyHome.bin,
                responseBody: successResponseBody
            });

            expect(httpsProxyResult.first).toEqual(successResult.first);
            expect(httpsProxyResult.second).toEqual(successResult.first);
            expect(httpsProxyResult.requestCount).toBe(1);
            expect(httpsProxyResult.proxyAgentConfigured).toBe(true);
            expect(httpsProxyResult.requestHost).toBe('api.anthropic.com');

            const lowercaseProxyResult = harness.runProbe({
                claudeConfigDir: lowercaseProxyHome.claudeConfig,
                home: lowercaseProxyHome.home,
                lowercaseHttpsProxy: 'http://proxy.local:8080',
                mode: 'success',
                nowMs,
                pathDir: lowercaseProxyHome.bin,
                responseBody: successResponseBody
            });

            expect(lowercaseProxyResult.first).toEqual(successResult.first);
            expect(lowercaseProxyResult.second).toEqual(successResult.first);
            expect(lowercaseProxyResult.requestCount).toBe(1);
            // Windows environment variables are case-insensitive, so a
            // lowercase https_proxy is indistinguishable from HTTPS_PROXY there
            expect(lowercaseProxyResult.proxyAgentConfigured).toBe(process.platform === 'win32');

            const blankProxyResult = harness.runProbe({
                claudeConfigDir: blankProxyHome.claudeConfig,
                home: blankProxyHome.home,
                httpsProxy: '   ',
                mode: 'success',
                nowMs,
                pathDir: blankProxyHome.bin,
                responseBody: successResponseBody
            });

            expect(blankProxyResult.first).toEqual(successResult.first);
            expect(blankProxyResult.second).toEqual(successResult.first);
            expect(blankProxyResult.requestCount).toBe(1);
            expect(blankProxyResult.proxyAgentConfigured).toBe(false);

            const invalidProxyResult = harness.runProbe({
                claudeConfigDir: invalidProxyHome.claudeConfig,
                home: invalidProxyHome.home,
                httpsProxy: '://bad-proxy',
                mode: 'success',
                nowMs,
                pathDir: invalidProxyHome.bin,
                responseBody: successResponseBody
            });

            expect(invalidProxyResult.first).toEqual({ error: 'api-error' });
            expect(invalidProxyResult.second).toEqual({ error: 'api-error' });
            expect(invalidProxyResult.requestCount).toBe(0);
            expect(invalidProxyResult.proxyAgentConfigured).toBe(false);

            const staleProxyResult = harness.runProbe({
                claudeConfigDir: successHome.claudeConfig,
                home: successHome.home,
                httpsProxy: '://bad-proxy',
                mode: 'success',
                nowMs: nowMs + 181000,
                pathDir: successHome.bin,
                responseBody: successResponseBody
            });

            expect(staleProxyResult.first).toEqual(successResult.first);
            expect(staleProxyResult.second).toEqual(successResult.first);
            expect(staleProxyResult.requestCount).toBe(0);
            expect(staleProxyResult.proxyAgentConfigured).toBe(false);

            const cachedSuccessResult = harness.runProbe({
                claudeConfigDir: successHome.claudeConfig,
                home: successHome.home,
                mode: 'unexpected',
                nowMs,
                pathDir: successHome.bin
            });

            expect(cachedSuccessResult.first).toEqual(successResult.first);
            expect(cachedSuccessResult.second).toEqual(successResult.first);
            expect(cachedSuccessResult.cacheExists).toBe(true);
            expect(cachedSuccessResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('treats null API per-model buckets as zero usage', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('null-per-model');
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields: ['weeklySonnetUsage', 'weeklyOpusUsage'],
                responseBody: nullPerModelResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z',
                weeklySonnetUsage: 0,
                weeklyOpusUsage: 0
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('parses null aggregate buckets and cohort fields from the usage API', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('cohort-fields');
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields: ['weeklyUsage', 'weeklySonnetUsage', 'weeklyOpusUsage', 'extraUsageEnabled'],
                responseBody: cohortResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 52,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 0,
                weeklySonnetUsage: 0,
                weeklyOpusUsage: 0,
                extraUsageEnabled: false
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('parses extra usage budget fields from the usage API', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('extra-usage');
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields: ['extraUsageEnabled', 'extraUsageLimit', 'extraUsageUsed', 'extraUsageUtilization'],
                responseBody: extraUsageResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z',
                extraUsageEnabled: true,
                extraUsageLimit: 400000,
                extraUsageUsed: 10600,
                extraUsageUtilization: 2.6,
                extraUsageCurrency: 'EUR'
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('treats disabled extra usage as complete for extra usage widget fields', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('disabled-extra-usage');
            const requiredFields = ['extraUsageEnabled', 'extraUsageLimit', 'extraUsageUsed', 'extraUsageUtilization'];
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields,
                responseBody: cohortResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 52,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 0,
                weeklySonnetUsage: 0,
                weeklyOpusUsage: 0,
                extraUsageEnabled: false
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);

            // The probe writes the usage cache with a real-wall-clock mtime, so derive
            // 'now' from it (not the mocked epoch) to keep the cache within
            // CACHE_MAX_AGE. This exercises the file-cache fast path a real later
            // render takes, rather than depending on a lingering lock to suppress
            // the refetch.
            const cacheMtimeMs = fs.statSync(usageFilePath(home, 'json')).mtimeMs;
            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: cacheMtimeMs + 10000,
                pathDir: home.bin,
                requiredFields
            });

            expect(cachedResult.first).toEqual(result.first);
            expect(cachedResult.second).toEqual(result.first);
            expect(cachedResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('treats a missing fable window as conclusive when core usage fields are present', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('missing-fable-conclusive');
            const requiredFields = ['fableUsage'];
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields,
                responseBody: successResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);

            const cacheMtimeMs = fs.statSync(usageFilePath(home, 'json')).mtimeMs;
            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: cacheMtimeMs + 10000,
                pathDir: home.bin,
                requiredFields
            });

            expect(cachedResult.first).toEqual(result.first);
            expect(cachedResult.second).toEqual(result.first);
            expect(cachedResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('parses an unused fable quota (0%, no resets_at) as real zero usage and serves it from cache', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('unused-fable-quota');
            const requiredFields = ['fableUsage'];
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields,
                responseBody: unusedFableQuotaResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z',
                fableUsage: 0
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);

            const cacheMtimeMs = fs.statSync(usageFilePath(home, 'json')).mtimeMs;
            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: cacheMtimeMs + 10000,
                pathDir: home.bin,
                requiredFields
            });

            expect(cachedResult.first).toEqual(result.first);
            expect(cachedResult.second).toEqual(result.first);
            expect(cachedResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('treats a missing fable window as conclusive when core usage fields are present', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('missing-fable-conclusive');
            const requiredFields = ['fableUsage'];
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields,
                responseBody: successResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);

            const cacheMtimeMs = fs.statSync(usageFilePath(home, 'json')).mtimeMs;
            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: cacheMtimeMs + 10000,
                pathDir: home.bin,
                requiredFields
            });

            expect(cachedResult.first).toEqual(result.first);
            expect(cachedResult.second).toEqual(result.first);
            expect(cachedResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('clears the in-flight lock after a successful fetch', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('success-clears-lock');
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            // fetchUsageData writes a short 'timeout' lock before the request as an
            // in-flight guard. A successful fetch must remove it; otherwise the lock
            // lingers for LOCK_MAX_AGE and a later cache miss (e.g. an account switch
            // invalidating the fingerprint) reports a spurious [Timeout] while the
            // API is healthy.
            expect(result.cacheExists).toBe(true);
            expect(result.lockExists).toBe(false);
            expect(result.lockContents).toBeNull();
        } finally {
            harness.cleanup();
        }
    });

    it('keeps a rate-limit lock that a concurrent render wrote during the fetch', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('success-keeps-foreign-lock');
            // Another render got a 429 while this request was in flight. Deleting
            // its lock would let the next render fetch inside the Retry-After window.
            const rateLimitedLock = JSON.stringify({
                blockedUntil: Math.floor(nowMs / 1000) + 300,
                error: 'rate-limited'
            });
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                lockWrittenDuringRequest: rateLimitedLock,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            expect(result.requestCount).toBe(1);
            expect(result.cacheExists).toBe(true);
            expect(result.lockContents).toBe(rateLimitedLock);
        } finally {
            harness.cleanup();
        }
    });

    it('ignores a lock whose deadline is implausibly far in the future', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('lock-beyond-horizon');
            const cacheDir = path.join(home.home, '.cache', 'ccstatusline');
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(usageFilePath(home, 'lock'), JSON.stringify({
                blockedUntil: Math.floor(nowMs / 1000) + (10 * 365 * 24 * 60 * 60),
                error: 'timeout'
            }));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            // The JSON lock stores an absolute deadline and so cannot age out.
            // Honoring a bogus one strands every usage widget on [Timeout] with
            // no way back; the fetch must run and overwrite the poisoned file.
            expect(result.requestCount).toBe(1);
            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(result.lockExists).toBe(false);
        } finally {
            harness.cleanup();
        }
    });

    it('honors a long but plausible rate-limit lock', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('lock-within-horizon');
            const cacheDir = path.join(home.home, '.cache', 'ccstatusline');
            fs.mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(usageFilePath(home, 'lock'), JSON.stringify({
                blockedUntil: Math.floor(nowMs / 1000) + (12 * 60 * 60),
                error: 'rate-limited'
            }));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs,
                pathDir: home.bin
            });

            // The horizon must not undercut a genuine Retry-After backoff.
            expect(result.requestCount).toBe(0);
            expect(result.first).toEqual({ error: 'rate-limited' });
        } finally {
            harness.cleanup();
        }
    });

    it('backs off credential lookups across renders after finding none, per profile', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('no-credentials-backoff');
            const otherProfile = harness.createTokenHome('no-credentials-backoff-other');
            const credentialsFile = path.join(home.claudeConfig, '.credentials.json');
            fs.rmSync(credentialsFile);
            const renderAt = (probeNowMs: number, claudeConfig = home.claudeConfig) => harness.runProbe({
                claudeConfigDir: claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: probeNowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            expect(renderAt(nowMs).first).toEqual({ error: 'no-credentials' });

            // An API-key user has no OAuth login to find, and on macOS each
            // lookup spawns `security` twice, a full keychain dump included.
            // Later renders inside the window skip the lookup entirely, so a
            // login made meanwhile is only picked up once it ends.
            fs.writeFileSync(credentialsFile, JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } }));
            const backedOff = renderAt(nowMs + 10000);
            expect(backedOff.first).toEqual({ error: 'no-credentials' });
            expect(backedOff.requestCount).toBe(0);

            // Another profile's lookup is not suppressed by this one's miss.
            const other = renderAt(nowMs + 10000, otherProfile.claudeConfig);
            expect(other.first.sessionUsage).toBe(42);
            expect(other.requestCount).toBe(1);

            const retried = renderAt(nowMs + 31000);
            expect(retried.first.sessionUsage).toBe(42);
            expect(retried.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it.skipIf(process.platform !== 'darwin')('stops default Keychain probes after a real fake-security timeout and still uses the credentials file', { timeout: 15_000 }, () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTimedOutSecurityHome('keychain-timeout');
            const timeoutMarker = path.join(home.home, 'security-timeout.txt');
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                claudeSecureStorageConfigDir: '',
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            expect(result.securityCalls).toEqual([
                'find-generic-password -s Claude Code-credentials -w'
            ]);
            expect(fs.readFileSync(timeoutMarker, 'utf8')).toBe('terminated\n');
            expect(result.first.sessionUsage).toBe(42);
            expect(result.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('preserves the in-flight lock after a successful fetch missing required fields', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('success-missing-required-fields');
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields: ['weeklySonnetUsage'],
                responseBody: successResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(result.second).toEqual({ error: 'timeout' });
            expect(result.cacheExists).toBe(true);
            expect(result.requestCount).toBe(1);
            expect(parseLockContents(result.lockContents)).toEqual({
                blockedUntil: Math.floor(nowMs / 1000) + 30,
                error: 'timeout'
            });
        } finally {
            harness.cleanup();
        }
    });

    it('refetches a fresh cache when the token fingerprint changes (account switch)', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-switch');
            const cacheDir = path.join(home.home, '.cache', 'ccstatusline');
            fs.mkdirSync(cacheDir, { recursive: true });
            const cacheFile = usageFilePath(home, 'json');
            // A complete cache written under a different account's token.
            fs.writeFileSync(cacheFile, JSON.stringify({ sessionUsage: 5, tokenHash: 'deadbeefdeadbeef' }));
            const seededMtimeMs = fs.statSync(cacheFile).mtimeMs;

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: seededMtimeMs + 5000,
                pathDir: home.bin,
                requiredFields: ['sessionUsage'],
                responseBody: successResponseBody
            });

            // The cached fingerprint mismatches the live token, so the still-fresh
            // cache is rejected and the API is hit once for the new account.
            expect(result.requestCount).toBe(1);
            expect(result.first.sessionUsage).toBe(42);
        } finally {
            harness.cleanup();
        }
    });

    it('does not serve a mismatched account cache during an active lock', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-switch-active-lock');
            const cacheDir = path.join(home.home, '.cache', 'ccstatusline');
            fs.mkdirSync(cacheDir, { recursive: true });
            const cacheFile = usageFilePath(home, 'json');
            const lockFile = usageFilePath(home, 'lock');
            fs.writeFileSync(cacheFile, JSON.stringify({ sessionUsage: 5, tokenHash: 'deadbeefdeadbeef' }));

            const seededMtimeMs = fs.statSync(cacheFile).mtimeMs;
            const lockedNowMs = seededMtimeMs + 5000;
            fs.writeFileSync(lockFile, JSON.stringify({
                blockedUntil: Math.floor(lockedNowMs / 1000) + 30,
                error: 'timeout'
            }));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: lockedNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(result.first).toEqual({ error: 'timeout' });
            expect(result.second).toEqual({ error: 'timeout' });
            expect(result.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('does not serve a mismatched account cache during a rate-limit backoff', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-switch-rate-limit');
            const cacheDir = path.join(home.home, '.cache', 'ccstatusline');
            fs.mkdirSync(cacheDir, { recursive: true });
            const cacheFile = usageFilePath(home, 'json');
            fs.writeFileSync(cacheFile, JSON.stringify({ sessionUsage: 5, tokenHash: 'deadbeefdeadbeef' }));

            const seededMtimeMs = fs.statSync(cacheFile).mtimeMs;
            const rateLimitedNowMs = seededMtimeMs + 5000;
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'status',
                nowMs: rateLimitedNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage'],
                responseBody: rateLimitedResponseBody,
                responseHeaders: { 'retry-after': '3600' },
                statusCode: 429
            });

            expect(result.first).toEqual({ error: 'rate-limited' });
            expect(result.second).toEqual({ error: 'rate-limited' });
            expect(result.requestCount).toBe(1);
            expect(parseLockContents(result.lockContents)).toEqual({
                blockedUntil: Math.floor(rateLimitedNowMs / 1000) + 3600,
                error: 'rate-limited'
            });
        } finally {
            harness.cleanup();
        }
    });

    it('serves a fresh cache whose token fingerprint matches (same account)', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-same');
            const cacheDir = path.join(home.home, '.cache', 'ccstatusline');
            fs.mkdirSync(cacheDir, { recursive: true });
            const cacheFile = usageFilePath(home, 'json');
            const matchingHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
            fs.writeFileSync(cacheFile, JSON.stringify({ sessionUsage: 5, tokenHash: matchingHash }));
            const seededMtimeMs = fs.statSync(cacheFile).mtimeMs;

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: seededMtimeMs + 5000,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            // Fingerprint matches and the cache is fresh, so it is served with no API call.
            expect(result.requestCount).toBe(0);
            expect(result.first.sessionUsage).toBe(5);
        } finally {
            harness.cleanup();
        }
    });

    it.each([
        ['a day', 24 * 60 * 60 * 1000, 1, 42],
        ['a few seconds', 2000, 0, 5]
    ])('refetches a cache dated %s in the future only when the date cannot be right', (_label, aheadMs, expectedRequests, expectedSessionUsage) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('future-dated-cache');
            const matchingHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
            const { cacheFile, mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash: matchingHash });
            // A day ahead: written while the system clock ran fast, since
            // corrected. A few seconds ahead: a concurrent render wrote it
            // after this one read the clock.
            const futureSeconds = (mtimeMs + aheadMs) / 1000;
            fs.utimesSync(cacheFile, futureSeconds, futureSeconds);

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: mtimeMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage'],
                responseBody: successResponseBody
            });

            expect(result.requestCount).toBe(expectedRequests);
            expect(result.first.sessionUsage).toBe(expectedSessionUsage);
        } finally {
            harness.cleanup();
        }
    });

    it.each([
        ['fresh', 5000],
        ['stale', 200000]
    ])('serves a %s legacy cache during backoff without rewriting the cache or lock', (_state, cacheAgeMs) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('legacy-cache-backoff');
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'current-access-token',
                refreshToken: 'current-refresh-token'
            });
            const legacyHash = createHash('sha256').update('current-access-token').digest('hex').slice(0, 16);
            const { cacheFile, mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash: legacyHash });
            const cacheContents = fs.readFileSync(cacheFile, 'utf8');
            const probeNowMs = mtimeMs + cacheAgeMs;
            const lockFile = usageFilePath(home, 'lock');
            const lockContents = JSON.stringify({
                blockedUntil: Math.floor(probeNowMs / 1000) + 3600,
                error: 'rate-limited'
            });
            fs.writeFileSync(lockFile, lockContents);
            const lockMtimeMs = fs.statSync(lockFile).mtimeMs;

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: probeNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(result.first).toEqual({ sessionUsage: 5 });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(0);
            expect(result.lockContents).toBe(lockContents);
            expect(fs.statSync(lockFile).mtimeMs).toBe(lockMtimeMs);
            expect(fs.readFileSync(cacheFile, 'utf8')).toBe(cacheContents);
            expect(fs.statSync(cacheFile).mtimeMs).toBe(mtimeMs);
        } finally {
            harness.cleanup();
        }
    });

    it.each(['other-access-token', 'other-refresh-token', undefined])('rejects a cache fingerprint from %s when both current tokens are available', (cachedToken) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('unrelated-cache-backoff');
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'current-access-token',
                refreshToken: 'current-refresh-token'
            });
            const tokenHash = cachedToken === undefined
                ? undefined
                : createHash('sha256').update(cachedToken).digest('hex').slice(0, 16);
            const { mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash });
            const probeNowMs = mtimeMs + 5000;
            fs.writeFileSync(usageFilePath(home, 'lock'), JSON.stringify({
                blockedUntil: Math.floor(probeNowMs / 1000) + 3600,
                error: 'rate-limited'
            }));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: probeNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(result.first).toEqual({ error: 'rate-limited' });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it.each(['current-refresh-token', ''])('writes the preferred fingerprint after a successful fetch with refresh token %j', (refreshToken) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('legacy-cache-migration');
            writeUsageCredentials(home.claudeConfig, { accessToken: 'current-access-token', refreshToken });
            const legacyHash = createHash('sha256').update('current-access-token').digest('hex').slice(0, 16);
            const { cacheFile, mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash: legacyHash });

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: mtimeMs + 200000,
                pathDir: home.bin,
                requiredFields: ['sessionUsage'],
                responseBody: successResponseBody
            });

            expect(result.first.sessionUsage).toBe(42);
            expect(result.requestCount).toBe(1);
            const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Record<string, unknown>;
            const expectedToken = refreshToken || 'current-access-token';
            expect(cache.tokenHash).toBe(createHash('sha256').update(expectedToken).digest('hex').slice(0, 16));
        } finally {
            harness.cleanup();
        }
    });

    it.each([
        ['current-access-token', { sessionUsage: 5 }],
        ['', { error: 'rate-limited' }]
    ])('uses only the access-token fingerprint when the refresh token is empty (cached token %j)', (cachedToken, expected) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('empty-refresh-token');
            writeUsageCredentials(home.claudeConfig, { accessToken: 'current-access-token', refreshToken: '' });
            const tokenHash = createHash('sha256').update(cachedToken).digest('hex').slice(0, 16);
            const { mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash });
            const probeNowMs = mtimeMs + 5000;
            fs.writeFileSync(usageFilePath(home, 'lock'), JSON.stringify({
                blockedUntil: Math.floor(probeNowMs / 1000) + 3600,
                error: 'rate-limited'
            }));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: probeNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(result.first).toEqual(expected);
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('serves a fresh cache after the access token was refreshed (same login)', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('access-token-refreshed');
            // The access token was reissued since the cache was written; the
            // refresh token, which identifies the login, is unchanged.
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'reissued-access-token',
                refreshToken: 'stable-refresh-token'
            });
            const fingerprint = createHash('sha256').update('stable-refresh-token').digest('hex').slice(0, 16);
            const { mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash: fingerprint });

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: mtimeMs + 5000,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            // A refresh must not look like an account switch: the cache stands
            // and no request is made.
            expect(result.requestCount).toBe(0);
            expect(result.first.sessionUsage).toBe(5);
        } finally {
            harness.cleanup();
        }
    });

    it('serves a stale cache through a rate-limit backoff after the access token was refreshed', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('access-token-refreshed-rate-limit');
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'reissued-access-token',
                refreshToken: 'stable-refresh-token'
            });
            const fingerprint = createHash('sha256').update('stable-refresh-token').digest('hex').slice(0, 16);
            const { mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash: fingerprint });

            // Cache is past CACHE_MAX_AGE and a server-issued backoff is active,
            // so the stale-cache fallback is the only thing standing between the
            // widgets and error text for the rest of the window.
            const backedOffNowMs = mtimeMs + 200000;
            fs.writeFileSync(usageFilePath(home, 'lock'), JSON.stringify({
                blockedUntil: Math.floor(backedOffNowMs / 1000) + 3600,
                error: 'rate-limited'
            }));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: backedOffNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(result.first).toEqual({ sessionUsage: 5 });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('dates a fetched answer by when it came, and an error by nothing', () => {
        const harness = createProbeHarness();

        try {
            const successHome = harness.createTokenHome('fetched-at-success');
            const errorHome = harness.createTokenHome('fetched-at-error');

            const success = harness.runProbe({
                claudeConfigDir: successHome.claudeConfig,
                home: successHome.home,
                mode: 'success',
                nowMs,
                pathDir: successHome.bin,
                responseBody: successResponseBody
            });
            const error = harness.runProbe({
                claudeConfigDir: errorHome.claudeConfig,
                home: errorHome.home,
                mode: 'error',
                nowMs,
                pathDir: errorHome.bin
            });

            expect(success.requestCount).toBe(1);
            expect(success.fetchedAtMs).toBe(nowMs);
            expect(error.first).toEqual({ error: 'api-error' });
            expect(error.fetchedAtMs).toBeNull();
        } finally {
            harness.cleanup();
        }
    });

    // The forecast history goes by when a percent was seen, and a cached one
    // isn't current: through a rate limit it can be hours old.
    it('dates cached usage by when the cache was written, fresh or served through a rate limit', () => {
        const harness = createProbeHarness();

        try {
            const freshHome = harness.createTokenHome('fetched-at-fresh-cache');
            const staleHome = harness.createTokenHome('fetched-at-stale-cache');
            const matchingHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
            const fresh = seedUsageCache(freshHome, { sessionUsage: 5, tokenHash: matchingHash });
            const stale = seedUsageCache(staleHome, { sessionUsage: 5, tokenHash: matchingHash });
            const backedOffNowMs = stale.mtimeMs + 2 * 60 * 60 * 1000;
            fs.writeFileSync(usageFilePath(staleHome, 'lock'), JSON.stringify({
                blockedUntil: Math.floor(backedOffNowMs / 1000) + 3600,
                error: 'rate-limited'
            }));

            const freshResult = harness.runProbe({
                claudeConfigDir: freshHome.claudeConfig,
                home: freshHome.home,
                mode: 'unexpected',
                nowMs: fresh.mtimeMs + 60000,
                pathDir: freshHome.bin,
                requiredFields: ['sessionUsage']
            });
            const staleResult = harness.runProbe({
                claudeConfigDir: staleHome.claudeConfig,
                home: staleHome.home,
                mode: 'unexpected',
                nowMs: backedOffNowMs,
                pathDir: staleHome.bin,
                requiredFields: ['sessionUsage']
            });

            expect(freshResult.first).toEqual({ sessionUsage: 5 });
            expect(freshResult.fetchedAtMs).toBe(fresh.mtimeMs);
            expect(staleResult.first).toEqual({ sessionUsage: 5 });
            expect(staleResult.fetchedAtMs).toBe(stale.mtimeMs);
            expect(freshResult.requestCount + staleResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('refetches when the refresh token changes (account switch)', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('refresh-token-switched');
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'other-account-access-token',
                refreshToken: 'other-account-refresh-token'
            });
            const previousFingerprint = createHash('sha256').update('previous-refresh-token').digest('hex').slice(0, 16);
            const { mtimeMs } = seedUsageCache(home, { sessionUsage: 5, tokenHash: previousFingerprint });

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: mtimeMs + 5000,
                pathDir: home.bin,
                requiredFields: ['sessionUsage'],
                responseBody: successResponseBody
            });

            // A different login still invalidates the cache immediately.
            expect(result.requestCount).toBe(1);
            expect(result.first.sessionUsage).toBe(42);
        } finally {
            harness.cleanup();
        }
    });

    it('treats enabled extra usage without a monthly limit as complete for extra usage widget fields', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('no-limit-extra-usage');
            const requiredFields = ['extraUsageEnabled', 'extraUsageLimit', 'extraUsageUsed', 'extraUsageUtilization'];
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields,
                responseBody: noLimitExtraUsageResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z',
                extraUsageEnabled: true,
                extraUsageUsed: 542
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);

            // The probe writes the usage cache with a real-wall-clock mtime, so derive
            // 'now' from it (not the mocked epoch) to keep the cache within
            // CACHE_MAX_AGE. This exercises the file-cache fast path a real later
            // render takes, rather than depending on a lingering lock to suppress
            // the refetch.
            const cacheMtimeMs = fs.statSync(usageFilePath(home, 'json')).mtimeMs;
            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: cacheMtimeMs + 10000,
                pathDir: home.bin,
                requiredFields
            });

            expect(cachedResult.first).toEqual(result.first);
            expect(cachedResult.second).toEqual(result.first);
            expect(cachedResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('treats null rate-limit windows as complete for window reset fields', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('enterprise-null-windows');
            const requiredFields = ['sessionUsage', 'sessionResetAt', 'weeklyUsage', 'weeklyResetAt', 'weeklySonnetResetAt', 'weeklyOpusResetAt'];
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                requiredFields,
                responseBody: enterpriseNullWindowsResponseBody
            });

            expect(result.first).toEqual({
                sessionUsage: 0,
                weeklyUsage: 0,
                weeklySonnetUsage: 0,
                weeklyOpusUsage: 0,
                extraUsageEnabled: true,
                extraUsageLimit: 50000,
                extraUsageCurrency: 'USD',
                extraUsageUsed: 0
            });
            expect(result.second).toEqual(result.first);
            expect(result.requestCount).toBe(1);

            // The probe writes the usage cache with a real-wall-clock mtime, so derive
            // 'now' from it (not the mocked epoch) to keep the cache within
            // CACHE_MAX_AGE. This exercises the file-cache fast path a real later
            // render takes, rather than depending on a lingering lock to suppress
            // the refetch.
            const cacheMtimeMs = fs.statSync(usageFilePath(home, 'json')).mtimeMs;
            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: cacheMtimeMs + 10000,
                pathDir: home.bin,
                requiredFields
            });

            expect(cachedResult.first).toEqual(result.first);
            expect(cachedResult.second).toEqual(result.first);
            expect(cachedResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('keeps parse-error locks distinct from timeout locks', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('parse-error-lock');
            const parseErrorResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: '{'
            });

            expect(parseErrorResult.first).toEqual({ error: 'parse-error' });
            expect(parseErrorResult.second).toEqual({ error: 'parse-error' });
            expect(parseLockContents(parseErrorResult.lockContents)).toEqual({
                blockedUntil: Math.floor(nowMs / 1000) + 30,
                error: 'parse-error'
            });

            const activeLockResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs,
                pathDir: home.bin
            });

            expect(activeLockResult.first).toEqual({ error: 'parse-error' });
            expect(activeLockResult.second).toEqual({ error: 'parse-error' });
            expect(activeLockResult.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('bypasses fresh aggregate-only cache when requested per-model fields are missing', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('required-fields');
            const aggregateOnlyResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            expect(aggregateOnlyResult.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(aggregateOnlyResult.requestCount).toBe(1);

            const perModelResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: nowMs + 31000,
                pathDir: home.bin,
                requiredFields: ['weeklySonnetUsage'],
                responseBody: perModelSuccessResponseBody
            });

            expect(perModelResult.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z',
                weeklySonnetUsage: 8,
                weeklySonnetResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(perModelResult.second).toEqual(perModelResult.first);
            expect(perModelResult.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('reuses stale cached data during a numeric Retry-After backoff and retries after expiry', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('rate-limited-with-cache');
            const rateLimitNowMs = nowMs + 31000;
            const successResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            const rateLimitedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'status',
                nowMs: rateLimitNowMs,
                pathDir: home.bin,
                responseBody: rateLimitedResponseBody,
                responseHeaders: { 'retry-after': '3600' },
                statusCode: 429
            });

            expect(rateLimitedResult.first).toEqual(successResult.first);
            expect(rateLimitedResult.second).toEqual(successResult.first);
            expect(rateLimitedResult.requestCount).toBe(1);
            expect(parseLockContents(rateLimitedResult.lockContents)).toEqual({
                blockedUntil: Math.floor(rateLimitNowMs / 1000) + 3600,
                error: 'rate-limited'
            });

            const activeBackoffResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: rateLimitNowMs + 600000,
                pathDir: home.bin
            });

            expect(activeBackoffResult.first).toEqual(successResult.first);
            expect(activeBackoffResult.second).toEqual(successResult.first);
            expect(activeBackoffResult.requestCount).toBe(0);

            const postBackoffResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: rateLimitNowMs + 3601000,
                pathDir: home.bin,
                responseBody: updatedSuccessResponseBody
            });

            expect(postBackoffResult.first).toEqual({
                sessionUsage: 55,
                sessionResetAt: '2030-01-02T00:00:00.000Z',
                weeklyUsage: 21,
                weeklyResetAt: '2030-01-08T00:00:00.000Z'
            });
            expect(postBackoffResult.second).toEqual(postBackoffResult.first);
            expect(postBackoffResult.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    // The stale fallback carries no error, so a caller that must not take an
    // old reading for the API's current answer needs it marked.
    it.each([
        ['a rate-limit backoff', true, 0],
        ['a failed request', false, 1]
    ])('marks the stale cache served through %s as a stale fallback', (_label, backedOff, requestCount) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome(`stale-fallback-${requestCount}`);
            const tokenHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
            const { mtimeMs } = seedUsageCache(home, { sessionUsage: 97, tokenHash });
            // Long past CACHE_MAX_AGE, so only the fallback serves the cache,
            // and it has outlived any refresh
            const staleNowMs = mtimeMs + 40 * 60 * 1000;
            if (backedOff) {
                fs.writeFileSync(usageFilePath(home, 'lock'), JSON.stringify({
                    blockedUntil: Math.floor(staleNowMs / 1000) + 3600,
                    error: 'rate-limited'
                }));
            }

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: backedOff ? 'unexpected' : 'error',
                nowMs: staleNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(result.first).toEqual({ sessionUsage: 97 });
            // The second call answers from memory, with the same stale cache
            expect(result.second).toEqual(result.first);
            expect(result.staleFallback).toEqual([true, true]);
            expect(result.requestCount).toBe(requestCount);
        } finally {
            harness.cleanup();
        }
    });

    // Another render's ordinary refresh holds its in-flight lock for up to
    // LOCK_MAX_AGE once the cache expires. The cache served through that lock is
    // as current as a cache hit unless it has outlived the lock too.
    it.each([
        ['doesn\'t mark a cache that has just expired', 185, false],
        ['marks a cache older than the in-flight lock allows', 215, true]
    ])('%s while another render\'s refresh is in flight', (_label, cacheAgeSeconds, staleFallback) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome(`refresh-in-flight-${cacheAgeSeconds}`);
            const tokenHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
            const { mtimeMs } = seedUsageCache(home, { sessionUsage: 97, tokenHash });
            const refreshNowMs = mtimeMs + cacheAgeSeconds * 1000;
            fs.writeFileSync(usageFilePath(home, 'lock'), JSON.stringify({
                blockedUntil: Math.floor(refreshNowMs / 1000) + 28,
                error: 'timeout'
            }));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: refreshNowMs,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(result.first).toEqual({ sessionUsage: 97 });
            expect(result.second).toEqual(result.first);
            expect(result.staleFallback).toEqual([staleFallback, staleFallback]);
            expect(result.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('doesn\'t mark a fresh answer or a cache hit as a stale fallback', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('stale-fallback-unmarked');
            const fetchedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            expect(fetchedResult.requestCount).toBe(1);
            expect(fetchedResult.staleFallback).toEqual([false, false]);

            const cacheFile = usageFilePath(home, 'json');
            const cacheHitResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: fs.statSync(cacheFile).mtimeMs + 5000,
                pathDir: home.bin
            });

            expect(cacheHitResult.first).toEqual(fetchedResult.first);
            expect(cacheHitResult.requestCount).toBe(0);
            expect(cacheHitResult.staleFallback).toEqual([false, false]);
        } finally {
            harness.cleanup();
        }
    });

    // Overnight, last night's 95% would otherwise stay on screen after its
    // window reset, for as long as the API keeps refusing
    it.each([
        { requiredFields: [] },
        { requiredFields: ['sessionUsage', 'weeklyUsage'] }
    ])('leaves out stale cached windows that have already reset with required fields $requiredFields', ({ requiredFields }) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('rate-limited-expired-window');
            const sessionResetAt = new Date(nowMs + 60 * 60 * 1000).toISOString();
            const weeklyResetAt = new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString();
            harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: JSON.stringify({
                    five_hour: { utilization: 95, resets_at: sessionResetAt },
                    seven_day: { utilization: 40, resets_at: weeklyResetAt }
                })
            });
            const fetchedAtMs = fs.statSync(usageFilePath(home, 'json')).mtimeMs;

            // Two hours on, past the session reset
            const rateLimitedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'status',
                nowMs: nowMs + 2 * 60 * 60 * 1000,
                pathDir: home.bin,
                responseBody: rateLimitedResponseBody,
                responseHeaders: { 'retry-after': '3600' },
                requiredFields,
                statusCode: 429
            });

            expect(rateLimitedResult.first).toEqual({
                weeklyUsage: 40,
                weeklyResetAt,
                ...(requiredFields.length > 0 ? { error: 'rate-limited' } : {})
            });
            expect(rateLimitedResult.second).toEqual(rateLimitedResult.first);
            expect(rateLimitedResult.requestCount).toBe(1);
            expect(rateLimitedResult.fetchedAtMs).toBe(fetchedAtMs);
            expect(rateLimitedResult.staleFallback).toEqual([true, true]);

            const mixedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: nowMs + 2 * 60 * 60 * 1000 + 1000,
                pathDir: home.bin,
                requiredFields: ['sessionUsage', 'weeklyUsage']
            });

            expect(mixedResult.first).toEqual({ weeklyUsage: 40, weeklyResetAt, error: 'rate-limited' });
            expect(mixedResult.second).toEqual(mixedResult.first);
            expect(mixedResult.requestCount).toBe(0);
            expect(mixedResult.fetchedAtMs).toBe(fetchedAtMs);
            expect(mixedResult.staleFallback).toEqual([true, true]);

            const sessionResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: nowMs + 2 * 60 * 60 * 1000 + 1000,
                pathDir: home.bin,
                requiredFields: ['sessionUsage']
            });

            expect(sessionResult.first).toEqual({ error: 'rate-limited' });
            expect(sessionResult.requestCount).toBe(0);
            expect(sessionResult.fetchedAtMs).toBeNull();
        } finally {
            harness.cleanup();
        }
    });

    it('returns rate-limited without stale cache and falls back to the default backoff when Retry-After is invalid', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('rate-limited-no-cache');
            const firstRateLimitedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'status',
                nowMs,
                pathDir: home.bin,
                responseBody: rateLimitedResponseBody,
                responseHeaders: { 'retry-after': 'not-a-number' },
                statusCode: 429
            });

            expect(firstRateLimitedResult.first).toEqual({ error: 'rate-limited' });
            expect(firstRateLimitedResult.second).toEqual({ error: 'rate-limited' });
            expect(firstRateLimitedResult.requestCount).toBe(1);
            expect(parseLockContents(firstRateLimitedResult.lockContents)).toEqual({
                blockedUntil: Math.floor(nowMs / 1000) + 300,
                error: 'rate-limited'
            });

            const activeBackoffResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: nowMs + 299000,
                pathDir: home.bin
            });

            expect(activeBackoffResult.first).toEqual({ error: 'rate-limited' });
            expect(activeBackoffResult.second).toEqual({ error: 'rate-limited' });
            expect(activeBackoffResult.requestCount).toBe(0);

            const postBackoffResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs: nowMs + 301000,
                pathDir: home.bin,
                responseBody: successResponseBody
            });

            expect(postBackoffResult.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(postBackoffResult.second).toEqual(postBackoffResult.first);
            expect(postBackoffResult.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('parses HTTP-date Retry-After headers', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('rate-limited-http-date');
            const retryAt = new Date(nowMs + 900000).toUTCString();
            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'status',
                nowMs,
                pathDir: home.bin,
                responseBody: rateLimitedResponseBody,
                responseHeaders: { 'retry-after': retryAt },
                statusCode: 429
            });

            expect(result.first).toEqual({ error: 'rate-limited' });
            expect(result.second).toEqual({ error: 'rate-limited' });
            expect(parseLockContents(result.lockContents)).toEqual({
                blockedUntil: Math.floor((nowMs + 900000) / 1000),
                error: 'rate-limited'
            });
        } finally {
            harness.cleanup();
        }
    });

    it('supports the legacy empty lock file fallback', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('legacy-lock');
            const lockDir = path.join(home.home, '.cache', 'ccstatusline');
            const lockFile = usageFilePath(home, 'lock');

            fs.mkdirSync(lockDir, { recursive: true });
            fs.writeFileSync(lockFile, '');
            fs.utimesSync(lockFile, new Date(nowMs), new Date(nowMs));

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs,
                pathDir: home.bin
            });

            expect(result.first).toEqual({ error: 'timeout' });
            expect(result.second).toEqual({ error: 'timeout' });
            expect(result.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });
});

describe('fetchAccountEmail', () => {
    const nowMs = 2200000000000;
    const nowSeconds = Math.floor(nowMs / 1000);

    function profileResponseBody(email: string): string {
        return JSON.stringify({
            account: { uuid: 'account-uuid', email, full_name: 'Example User' },
            organization: { name: 'Example Org', organization_type: 'claude_max' }
        });
    }

    function fingerprint(token: string): string {
        return createHash('sha256').update(token).digest('hex').slice(0, 16);
    }

    function readCacheFile(home: string, fileName: string): unknown {
        const filePath = path.join(home, '.cache', 'ccstatusline', fileName);
        return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown : null;
    }

    function writeCacheFile(home: string, fileName: string, contents: unknown): void {
        const cacheDir = path.join(home, '.cache', 'ccstatusline');
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, fileName), JSON.stringify(contents));
    }

    it('looks up the email of the account the live credentials belong to', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email');
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'current-access-token',
                refreshToken: 'current-refresh-token'
            });

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: profileResponseBody('current@example.com'),
                target: 'account-email'
            });

            expect(result.first).toEqual({ status: 'available', email: 'current@example.com' });
            expect(result.second).toEqual({ status: 'available', email: 'current@example.com' });
            // The second call is answered from the cache
            expect(result.requestCount).toBe(1);
            expect(result.requestHost).toBe('api.anthropic.com');
            expect(result.requestPath).toBe('/api/oauth/profile');
            expect(result.requestAuthorization).toBe('Bearer current-access-token');
            expect(readCacheFile(home.home, `account-email-${fingerprint('current-refresh-token')}.json`)).toEqual({
                tokenHash: fingerprint('current-refresh-token'),
                email: 'current@example.com'
            });
        } finally {
            harness.cleanup();
        }
    });

    it.skipIf(process.platform === 'win32')('writes the email cache owner-only', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email-private');

            harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: profileResponseBody('current@example.com'),
                target: 'account-email'
            });

            const cacheFile = path.join(home.home, '.cache', 'ccstatusline', `account-email-${fingerprint('test-token')}.json`);
            expect(fs.statSync(cacheFile).mode & 0o777).toBe(0o600);
        } finally {
            harness.cleanup();
        }
    });

    it('keeps the cached email when the access token is refreshed for the same login', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email-refreshed');
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'reissued-access-token',
                refreshToken: 'stable-refresh-token'
            });
            writeCacheFile(home.home, 'account-email.json', [
                { tokenHash: fingerprint('stable-refresh-token'), email: 'current@example.com' }
            ]);

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs,
                pathDir: home.bin,
                target: 'account-email'
            });

            expect(result.first).toEqual({ status: 'available', email: 'current@example.com' });
            expect(result.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it('looks the email up again after a login change and keeps the other login cached', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email-switched');
            writeUsageCredentials(home.claudeConfig, {
                accessToken: 'current-access-token',
                refreshToken: 'current-refresh-token'
            });
            writeCacheFile(home.home, 'account-email.json', [
                { tokenHash: fingerprint('previous-refresh-token'), email: 'previous@example.com' }
            ]);

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: profileResponseBody('current@example.com'),
                target: 'account-email'
            });

            expect(result.first).toEqual({ status: 'available', email: 'current@example.com' });
            expect(result.requestCount).toBe(1);
            expect(readCacheFile(home.home, `account-email-${fingerprint('current-refresh-token')}.json`)).toEqual({
                tokenHash: fingerprint('current-refresh-token'),
                email: 'current@example.com'
            });
            expect(readCacheFile(home.home, 'account-email.json')).toEqual([
                { tokenHash: fingerprint('previous-refresh-token'), email: 'previous@example.com' }
            ]);
        } finally {
            harness.cleanup();
        }
    });

    it.each([
        { name: 'the request fails', mode: 'error' as const },
        { name: 'the endpoint rejects the token', mode: 'status' as const, statusCode: 401 },
        { name: 'the response names no email', mode: 'success' as const, responseBody: JSON.stringify({ account: { status: 'available', email: '' } }) }
    ])('returns unavailable and holds off for 30 seconds when $name', ({ mode, responseBody, statusCode }) => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email-failed');

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode,
                nowMs,
                pathDir: home.bin,
                responseBody,
                statusCode,
                target: 'account-email'
            });

            expect(result.first).toEqual({ status: 'unavailable' });
            expect(result.second).toEqual({ status: 'unavailable' });
            expect(result.requestCount).toBe(1);
            expect(readCacheFile(home.home, `account-email-${fingerprint('test-token')}.lock`)).toEqual({
                blockedUntil: nowSeconds + 30,
                tokenHash: fingerprint('test-token')
            });
            expect(readCacheFile(home.home, 'account-email.json')).toBeNull();
        } finally {
            harness.cleanup();
        }
    });

    it('holds off only the login whose lookup failed, and retries it after the backoff', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email-backoff');
            const otherProfile = harness.createTokenHome('account-email-backoff-other');
            writeUsageCredentials(otherProfile.claudeConfig, { accessToken: 'other-access-token' });
            const lookUpAt = (probeNowMs: number, claudeConfig: string, email: string | null) => harness.runProbe({
                claudeConfigDir: claudeConfig,
                home: home.home,
                mode: email === null ? 'error' : 'success',
                nowMs: probeNowMs,
                pathDir: home.bin,
                responseBody: email === null ? '' : profileResponseBody(email),
                target: 'account-email'
            });

            expect(lookUpAt(nowMs, home.claudeConfig, null).requestCount).toBe(1);

            const heldOff = lookUpAt(nowMs + 10000, home.claudeConfig, 'current@example.com');
            expect(heldOff.first).toEqual({ status: 'unavailable' });
            expect(heldOff.requestCount).toBe(0);

            const otherLogin = lookUpAt(nowMs + 10000, otherProfile.claudeConfig, 'other@example.com');
            expect(otherLogin.first).toEqual({ status: 'available', email: 'other@example.com' });
            expect(otherLogin.requestCount).toBe(1);

            const retried = lookUpAt(nowMs + 31000, home.claudeConfig, 'current@example.com');
            expect(retried.first).toEqual({ status: 'available', email: 'current@example.com' });
            expect(retried.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it.each(['error', 'status'] as const)('hides the previous account after a login switch followed by a lookup %s', (mode) => {
        const harness = createProbeHarness();
        try {
            const home = harness.createTokenHome('account-switch-failure');
            const render = (requestMode: ProbeOptions['mode'], time = nowMs) => harness.runProbe({
                home: home.home,
                claudeConfigDir: home.claudeConfig,
                pathDir: home.bin,
                mode: requestMode,
                nowMs: time,
                statusCode: requestMode === 'status' ? 429 : 200,
                responseHeaders: { 'retry-after': '120' },
                responseBody: profileResponseBody('previous@example.com'),
                target: 'account-email'
            });
            writeUsageCredentials(home.claudeConfig, { accessToken: 'previous-access', refreshToken: 'previous-refresh' });
            fs.writeFileSync(path.join(home.claudeConfig, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'previous@example.com' } }));
            expect(render('success').renderedEmail).toBe('Account: previous@example.com');

            writeUsageCredentials(home.claudeConfig, { accessToken: 'current-access', refreshToken: 'current-refresh' });
            const failed = render(mode);
            expect(failed.first).toEqual({ status: 'unavailable' });
            expect(failed.renderedEmail).toBeNull();
            expect(failed.requestCount).toBe(1);
            expect(failed.requestAuthorization).toBe('Bearer current-access');
            const blocked = render('unexpected', nowMs + 10000);
            expect(blocked.first).toEqual({ status: 'unavailable' });
            expect(blocked.renderedEmail).toBeNull();
            expect(blocked.requestCount).toBe(0);
            // The old email may remain cached, but only its own login may use it.
            writeUsageCredentials(home.claudeConfig, { accessToken: 'refreshed-previous-access', refreshToken: 'previous-refresh' });
            const previous = render('unexpected');
            expect(previous.renderedEmail).toBe('Account: previous@example.com');
            expect(previous.requestCount).toBe(0);
        } finally {
            harness.cleanup();
        }
    });

    it.each([false, true])('keeps alternating failure deadlines independent across two logins (first rate limited: %s)', (firstRateLimited) => {
        const harness = createProbeHarness();
        try {
            const first = harness.createTokenHome('alternating-first');
            const second = { ...harness.createTokenHome('alternating-second'), home: first.home };
            writeUsageCredentials(first.claudeConfig, { accessToken: 'access-a', refreshToken: 'refresh-a' });
            writeUsageCredentials(second.claudeConfig, { accessToken: 'access-b', refreshToken: 'refresh-b' });
            const render = (profile: TokenHome, mode: ProbeOptions['mode'], time: number) => harness.runProbe({
                home: profile.home,
                claudeConfigDir: profile.claudeConfig,
                pathDir: profile.bin,
                mode,
                nowMs: time,
                statusCode: mode === 'status' ? 429 : 200,
                responseHeaders: { 'retry-after': '120' },
                responseBody: profileResponseBody('recovered@example.com'),
                target: 'account-email'
            });
            expect(render(first, firstRateLimited ? 'status' : 'error', nowMs).requestCount).toBe(1);
            expect(render(second, firstRateLimited ? 'error' : 'status', nowMs).requestCount).toBe(1);
            expect(readCacheFile(first.home, `account-email-${fingerprint('refresh-a')}.lock`)).toEqual({
                tokenHash: fingerprint('refresh-a'),
                blockedUntil: nowSeconds + (firstRateLimited ? 120 : 30)
            });
            expect(readCacheFile(first.home, `account-email-${fingerprint('refresh-b')}.lock`)).toEqual({
                tokenHash: fingerprint('refresh-b'),
                blockedUntil: nowSeconds + (firstRateLimited ? 30 : 120)
            });
            // Access-token rotation must not bypass the login's backoff.
            writeUsageCredentials(first.claudeConfig, { accessToken: 'rotated-access-a', refreshToken: 'refresh-a' });
            for (const profile of [first, second]) {
                const blocked = render(profile, 'unexpected', nowMs + 10000);
                expect(blocked.first).toEqual({ status: 'unavailable' });
                expect(blocked.requestCount).toBe(0);
            }
            const shortBackoff = firstRateLimited ? second : first;
            const longBackoff = firstRateLimited ? first : second;
            expect(render(shortBackoff, 'error', nowMs + 31000).requestCount).toBe(1);
            expect(render(longBackoff, 'unexpected', nowMs + 31000).requestCount).toBe(0);
            const recovered = render(longBackoff, 'success', nowMs + 121000);
            expect(recovered.first).toEqual({ status: 'available', email: 'recovered@example.com' });
            expect(recovered.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('holds off for the Retry-After of a rate-limited lookup', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email-rate-limited');

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'status',
                nowMs,
                pathDir: home.bin,
                responseHeaders: { 'retry-after': '120' },
                statusCode: 429,
                target: 'account-email'
            });

            expect(result.first).toEqual({ status: 'unavailable' });
            expect(result.requestCount).toBe(1);
            expect(readCacheFile(home.home, `account-email-${fingerprint('test-token')}.lock`)).toEqual({
                blockedUntil: nowSeconds + 120,
                tokenHash: fingerprint('test-token')
            });
        } finally {
            harness.cleanup();
        }
    });

    it('ignores a backoff whose deadline is implausibly far in the future', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createTokenHome('account-email-poisoned-lock');
            writeCacheFile(home.home, `account-email-${fingerprint('test-token')}.lock`, {
                blockedUntil: nowSeconds + 2 * 24 * 60 * 60,
                tokenHash: fingerprint('test-token')
            });

            const result = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'success',
                nowMs,
                pathDir: home.bin,
                responseBody: profileResponseBody('current@example.com'),
                target: 'account-email'
            });

            expect(result.first).toEqual({ status: 'available', email: 'current@example.com' });
            expect(result.requestCount).toBe(1);
        } finally {
            harness.cleanup();
        }
    });

    it('does not call the profile endpoint without an OAuth login', () => {
        const harness = createProbeHarness();

        try {
            const home = harness.createEmptyHome('account-email-no-login');
            fs.writeFileSync(path.join(home.home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'snapshot@example.com' } }));

            const result = harness.runProbe({
                home: home.home,
                mode: 'unexpected',
                nowMs,
                target: 'account-email'
            });

            expect(result.first).toEqual({ status: 'no-credentials' });
            expect(result.second).toEqual({ status: 'no-credentials' });
            expect(result.requestCount).toBe(0);
            expect(result.renderedEmail).toBe('Account: snapshot@example.com');
        } finally {
            harness.cleanup();
        }
    });
});

// Guards the exact failure mode described in the code review that motivated
// WEEKLY_MODEL_USAGE_BUCKETS (usage-types.ts): CachedUsageDataSchema and
// UsageApiResponseSchema are hand-declared (see the comments on them in
// usage-fetch.ts for why they can't just be generated from the registry) and
// therefore CAN drift from it silently -- a field present in one schema but
// missing from the other would parse fine from a live API fetch, then vanish
// the moment that response round-trips through the on-disk cache. This test
// makes that drift fail loudly instead.
describe('usage API request behind a proxy that never answers CONNECT', () => {
    let originalProxy: string | undefined;
    let proxy: StalledProxy | null = null;

    beforeEach(() => {
        originalProxy = process.env.HTTPS_PROXY;
    });

    afterEach(async () => {
        await proxy?.stop();
        proxy = null;
        if (originalProxy === undefined) {
            delete process.env.HTTPS_PROXY;
        } else {
            process.env.HTTPS_PROXY = originalProxy;
        }
    });

    // The request's socket timeout can't fire before the proxy answers CONNECT,
    // and the agent's own connection to the proxy would keep the process alive
    it('gives up at the deadline and closes its connection to the proxy', async () => {
        proxy = await startStalledProxy();
        process.env.HTTPS_PROXY = proxy.url;

        expect(await __testing.fetchFromUsageApi('test-token', 50)).toEqual({ kind: 'error' });
        await proxy.connectionClosed;
    });
});

describe('WEEKLY_MODEL_USAGE_BUCKETS schema parity', () => {
    it('declares every registry bucket field in CachedUsageDataSchema', () => {
        const cachedKeys = new Set(Object.keys(__testing.CachedUsageDataSchema.shape));

        for (const bucket of WEEKLY_MODEL_USAGE_BUCKETS) {
            expect(cachedKeys.has(bucket.usageField), `CachedUsageDataSchema is missing "${bucket.usageField}"`).toBe(true);
            expect(cachedKeys.has(bucket.resetField), `CachedUsageDataSchema is missing "${bucket.resetField}"`).toBe(true);
        }
    });

    it('declares every registry legacy API key in UsageApiResponseSchema', () => {
        const apiKeys = new Set(Object.keys(__testing.UsageApiResponseSchema.shape));

        for (const bucket of WEEKLY_MODEL_USAGE_BUCKETS) {
            if (!bucket.apiBucketKey) {
                continue;
            }

            expect(apiKeys.has(bucket.apiBucketKey), `UsageApiResponseSchema is missing "${bucket.apiBucketKey}"`).toBe(true);
        }
    });

    it('round-trips every registry bucket through an API fetch and a cache read', () => {
        const apiResponse: Record<string, unknown> = {
            five_hour: { utilization: 10, resets_at: '2026-01-01T00:00:00Z' },
            seven_day: { utilization: 20, resets_at: '2026-01-08T00:00:00Z' },
            limits: WEEKLY_MODEL_USAGE_BUCKETS.map((bucket, index) => ({
                kind: 'weekly_scoped',
                percent: 30 + index,
                resets_at: `2026-01-0${index + 1}T00:00:00Z`,
                scope: { model: { display_name: bucket.modelDisplayName } }
            }))
        };

        const fromApi = __testing.parseUsageApiResponse(JSON.stringify(apiResponse));
        expect(fromApi).not.toBeNull();
        const fromCache = __testing.CachedUsageDataSchema.parse(fromApi);

        for (const [index, bucket] of WEEKLY_MODEL_USAGE_BUCKETS.entries()) {
            expect(fromCache[bucket.usageField], `"${bucket.usageField}" did not survive the cache round-trip`).toBe(30 + index);
            expect(fromCache[bucket.resetField], `"${bucket.resetField}" did not survive the cache round-trip`).toBe(`2026-01-0${index + 1}T00:00:00Z`);
        }
    });

    it('prefers a weekly_scoped limits[] entry over the legacy flat bucket for the same model', () => {
        // Shape captured from a live /api/oauth/usage response (2026-07):
        // the legacy seven_day_sonnet/seven_day_opus keys return null even
        // when the model has real usage; the real number is in limits[].
        const sonnetBucket = WEEKLY_MODEL_USAGE_BUCKETS.find(bucket => bucket.modelDisplayName === 'Sonnet');
        if (!sonnetBucket) {
            throw new Error('expected a Sonnet entry in WEEKLY_MODEL_USAGE_BUCKETS for this test');
        }

        const parsed = __testing.parseUsageApiResponse(JSON.stringify({
            five_hour: { utilization: 48, resets_at: '2026-07-17T13:50:00Z' },
            seven_day: { utilization: 18, resets_at: '2026-07-23T04:00:00Z' },
            seven_day_sonnet: null,
            seven_day_opus: null,
            limits: [
                { kind: 'session', percent: 48, resets_at: '2026-07-17T13:50:00Z', scope: null },
                { kind: 'weekly_all', percent: 18, resets_at: '2026-07-23T04:00:00Z', scope: null },
                { kind: 'weekly_scoped', percent: 3, resets_at: '2026-07-23T04:00:00Z', scope: { model: { display_name: 'Sonnet' } } }
            ]
        }));

        expect(parsed?.[sonnetBucket.usageField]).toBe(3);
        expect(parsed?.[sonnetBucket.resetField]).toBe('2026-07-23T04:00:00Z');
    });

    it('falls back to the legacy flat bucket when a model has no weekly_scoped limits[] entry', () => {
        const opusBucket = WEEKLY_MODEL_USAGE_BUCKETS.find(bucket => bucket.modelDisplayName === 'Opus');
        if (!opusBucket) {
            throw new Error('expected an Opus entry in WEEKLY_MODEL_USAGE_BUCKETS for this test');
        }

        const parsed = __testing.parseUsageApiResponse(JSON.stringify({
            five_hour: { utilization: 48, resets_at: '2026-07-17T13:50:00Z' },
            seven_day: { utilization: 18, resets_at: '2026-07-23T04:00:00Z' },
            seven_day_opus: { utilization: 42, resets_at: '2026-07-23T04:00:00Z' },
            limits: [
                { kind: 'weekly_scoped', percent: 3, resets_at: '2026-07-23T04:00:00Z', scope: { model: { display_name: 'Sonnet' } } }
            ]
        }));

        expect(parsed?.[opusBucket.usageField]).toBe(42);
        expect(parsed?.[opusBucket.resetField]).toBe('2026-07-23T04:00:00Z');
    });

    it('handles a real live-captured response (Fable-only limits[], no matching Sonnet/Opus entry) without erroring', () => {
        // Exact shape of a live response where only Fable has a weekly_scoped
        // entry. Sonnet/Opus have no limits[] entry, so they fall back to
        // their (explicitly null) legacy bucket -- 0%, per the pre-existing
        // #343 "null bucket -> 0 usage" convention preserved by that fallback.
        const parsed = __testing.parseUsageApiResponse(JSON.stringify({
            five_hour: { utilization: 48, resets_at: '2026-07-17T13:50:00.885205+00:00' },
            seven_day: { utilization: 18, resets_at: '2026-07-23T04:00:00.885227+00:00' },
            seven_day_opus: null,
            seven_day_sonnet: null,
            limits: [
                { kind: 'session', group: 'session', percent: 48, resets_at: '2026-07-17T13:50:00.885205+00:00', scope: null, is_active: true },
                { kind: 'weekly_all', group: 'weekly', percent: 18, resets_at: '2026-07-23T04:00:00.885227+00:00', scope: null, is_active: false },
                {
                    kind: 'weekly_scoped',
                    group: 'weekly',
                    percent: 3,
                    resets_at: '2026-07-23T04:00:00.885562+00:00',
                    scope: { model: { id: null, display_name: 'Fable' }, surface: null },
                    is_active: false
                }
            ],
            extra_usage: { is_enabled: false }
        }));

        expect(parsed?.sessionUsage).toBe(48);
        expect(parsed?.weeklyUsage).toBe(18);
        expect(parsed?.weeklySonnetUsage).toBe(0);
        expect(parsed?.weeklyOpusUsage).toBe(0);
        expect(parsed?.fableUsage).toBe(3);
        expect(parsed?.fableResetAt).toBe('2026-07-23T04:00:00.885562+00:00');
    });
});

describe('parseUsageApiResponse limits[] fallback (#503)', () => {
    const limitsOnlyResponseBody = JSON.stringify({
        limits: [
            {
                kind: 'session',
                group: 'session',
                percent: 15,
                is_active: false,
                resets_at: '2030-02-01T00:00:00.000Z'
            },
            {
                kind: 'weekly_all',
                group: 'weekly',
                percent: 36,
                is_active: false,
                resets_at: '2030-02-07T00:00:00.000Z'
            }
        ]
    });
    const flatAndLimitsResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-03-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-03-07T00:00:00.000Z'
        },
        limits: [
            {
                kind: 'session',
                percent: 99,
                resets_at: '2030-09-01T00:00:00.000Z'
            },
            {
                kind: 'weekly_all',
                percent: 88,
                resets_at: '2030-09-07T00:00:00.000Z'
            }
        ]
    });
    const partialFallbackResponseBody = JSON.stringify({
        seven_day: {
            utilization: null,
            resets_at: '2030-04-07T00:00:00.000Z'
        },
        limits: [
            {
                kind: 'weekly_all',
                percent: 71,
                resets_at: '2099-01-01T00:00:00.000Z'
            }
        ]
    });
    const placeholderLimitResponseBody = JSON.stringify({
        limits: [
            {
                kind: 'session',
                percent: 0,
                resets_at: null
            }
        ]
    });
    const unknownKindsAndScopedResponseBody = JSON.stringify({
        five_hour: {
            utilization: 10,
            resets_at: '2030-05-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 20,
            resets_at: '2030-05-07T00:00:00.000Z'
        },
        limits: [
            {
                kind: 'session',
                percent: 10,
                resets_at: '2030-05-01T00:00:00.000Z'
            },
            {
                kind: 'weekly_all',
                percent: 20,
                resets_at: '2030-05-07T00:00:00.000Z'
            },
            {
                kind: 'weekly_scoped',
                group: 'weekly',
                percent: 71,
                severity: 'normal',
                scope: {
                    model: {
                        id: null,
                        display_name: 'Fable'
                    },
                    surface: null
                },
                is_active: true,
                resets_at: '2030-05-07T00:00:00.000Z'
            },
            {
                kind: 'some_future_kind',
                percent: 55,
                resets_at: '2030-05-09T00:00:00.000Z'
            }
        ]
    });
    const noLimitsResponseBody = JSON.stringify({
        five_hour: {
            utilization: 42,
            resets_at: '2030-01-01T00:00:00.000Z'
        },
        seven_day: {
            utilization: 17,
            resets_at: '2030-01-07T00:00:00.000Z'
        }
    });
    const zeroPercentWithResetsResponseBody = JSON.stringify({
        limits: [
            {
                kind: 'session',
                percent: 0,
                resets_at: '2030-06-01T00:00:00.000Z'
            }
        ]
    });
    const nullPercentWithResetsResponseBody = JSON.stringify({
        limits: [
            {
                kind: 'session',
                percent: null,
                resets_at: '2030-06-01T00:00:00.000Z'
            }
        ]
    });
    const weeklyOnlyLimitsResponseBody = JSON.stringify({
        limits: [
            {
                kind: 'weekly_all',
                percent: 44,
                resets_at: '2030-06-07T00:00:00.000Z'
            }
        ]
    });
    const nullKindEntryResponseBody = JSON.stringify({
        limits: [
            {
                kind: null,
                percent: 50,
                resets_at: '2030-06-01T00:00:00.000Z'
            },
            {
                kind: 'session',
                percent: 12,
                resets_at: '2030-06-02T00:00:00.000Z'
            }
        ]
    });
    const duplicateSessionKindResponseBody = JSON.stringify({
        limits: [
            {
                kind: 'session',
                percent: 12,
                resets_at: '2030-06-01T00:00:00.000Z'
            },
            {
                kind: 'session',
                percent: 99,
                resets_at: '2099-01-01T00:00:00.000Z'
            }
        ]
    });
    // Whole-bucket null (five_hour/seven_day explicitly null, not merely
    // absent) is indistinguishable between an Enterprise account with no
    // rate-limit window (#343, correctly pinned to 0%) and a migrated
    // account whose flat buckets were hollowed out to null alongside a live
    // limits[] (#503). getUsageApiBucketUtilization(null) intentionally
    // returns 0 (the #343 rule) even though resets_at still falls back to
    // limits[] here - this is a known, accepted limitation: the parser
    // cannot tell the two cases apart from the payload alone, so the
    // percent stays pinned to 0 while the reset timer still advances.
    const nullBucketsWithLiveLimitsResponseBody = JSON.stringify({
        five_hour: null,
        seven_day: null,
        limits: [
            {
                kind: 'session',
                percent: 63,
                resets_at: '2030-07-01T00:00:00.000Z'
            },
            {
                kind: 'weekly_all',
                percent: 81,
                resets_at: '2030-07-07T00:00:00.000Z'
            }
        ]
    });

    it('derives session and weekly percentages and resets_at from limits[] when flat buckets are absent', () => {
        expect(parseUsageApiResponse(limitsOnlyResponseBody)).toEqual({
            sessionUsage: 15,
            sessionResetAt: '2030-02-01T00:00:00.000Z',
            weeklyUsage: 36,
            weeklyResetAt: '2030-02-07T00:00:00.000Z'
        });
    });

    it('prefers flat bucket values over limits[] when both are present', () => {
        expect(parseUsageApiResponse(flatAndLimitsResponseBody)).toEqual({
            sessionUsage: 42,
            sessionResetAt: '2030-03-01T00:00:00.000Z',
            weeklyUsage: 17,
            weeklyResetAt: '2030-03-07T00:00:00.000Z'
        });
    });

    it('falls back to limits[] percent independently of a present flat resets_at', () => {
        expect(parseUsageApiResponse(partialFallbackResponseBody)).toEqual({
            weeklyUsage: 71,
            weeklyResetAt: '2030-04-07T00:00:00.000Z'
        });
    });

    it('treats a limits[] entry with percent 0 and no resets_at as a placeholder (#343 rationale)', () => {
        expect(parseUsageApiResponse(placeholderLimitResponseBody)).toEqual({});
    });

    it('treats a model-scoped weekly limit at 0% with no resets_at as real zero usage, not a placeholder', () => {
        // Live payloads show a weekly_scoped entry sitting at percent 0 /
        // resets_at null until the scoped model is first used in the current
        // window (resets_at then fills in while percent stays 0), so unlike
        // the unscoped case above this is a real 0% reading. The reset field
        // stays unset until the window actually starts.
        expect(parseUsageApiResponse(JSON.stringify({
            limits: [
                {
                    kind: 'weekly_scoped',
                    group: 'weekly',
                    percent: 0,
                    resets_at: null,
                    scope: { model: { id: null, display_name: 'Fable' }, surface: null },
                    is_active: false
                }
            ]
        }))).toEqual({ fableUsage: 0 });
    });

    it('ignores unknown limits[] kinds but consumes fable weekly_scoped entries', () => {
        expect(parseUsageApiResponse(unknownKindsAndScopedResponseBody)).toEqual({
            sessionUsage: 10,
            sessionResetAt: '2030-05-01T00:00:00.000Z',
            weeklyUsage: 20,
            weeklyResetAt: '2030-05-07T00:00:00.000Z',
            fableUsage: 71,
            fableResetAt: '2030-05-07T00:00:00.000Z'
        });
    });

    it('derives fable usage/reset from a weekly_scoped entry with Fable case variants', () => {
        expect(parseUsageApiResponse(JSON.stringify({
            limits: [
                {
                    kind: 'weekly_scoped',
                    percent: 22,
                    resets_at: '2030-05-08T00:00:00.000Z',
                    scope: { model: { display_name: 'claude 3.5 fAbLe' } }
                }
            ]
        }))).toEqual({
            fableUsage: 22,
            fableResetAt: '2030-05-08T00:00:00.000Z'
        });
    });

    it('derives Sonnet usage/reset from its weekly_scoped entry', () => {
        expect(parseUsageApiResponse(JSON.stringify({
            limits: [
                {
                    kind: 'weekly_scoped',
                    percent: 99,
                    resets_at: '2030-05-08T00:00:00.000Z',
                    scope: { model: { display_name: 'Sonnet' } }
                }
            ]
        }))).toEqual({
            weeklySonnetUsage: 99,
            weeklySonnetResetAt: '2030-05-08T00:00:00.000Z'
        });
    });

    it('ignores weekly_scoped when no scope -> no crash', () => {
        expect(parseUsageApiResponse(JSON.stringify({
            limits: [
                {
                    kind: 'weekly_scoped',
                    percent: 10,
                    resets_at: '2030-05-08T00:00:00.000Z'
                }
            ]
        }))).toEqual({});
    });

    it('behaves identically to before when limits[] is absent', () => {
        expect(parseUsageApiResponse(noLimitsResponseBody)).toEqual({
            sessionUsage: 42,
            sessionResetAt: '2030-01-01T00:00:00.000Z',
            weeklyUsage: 17,
            weeklyResetAt: '2030-01-07T00:00:00.000Z'
        });
    });

    it('surfaces a limits[] entry reporting percent 0 with a resets_at as a real 0%, not a placeholder', () => {
        expect(parseUsageApiResponse(zeroPercentWithResetsResponseBody)).toEqual({
            sessionUsage: 0,
            sessionResetAt: '2030-06-01T00:00:00.000Z'
        });
    });

    it('treats a limits[] entry with percent null and a present resets_at as usage-undefined but keeps the reset time', () => {
        expect(parseUsageApiResponse(nullPercentWithResetsResponseBody)).toEqual({ sessionResetAt: '2030-06-01T00:00:00.000Z' });
    });

    it('does not reject the whole response when a limits[] entry has kind: null (F7)', () => {
        expect(parseUsageApiResponse(nullKindEntryResponseBody)).toEqual({
            sessionUsage: 12,
            sessionResetAt: '2030-06-02T00:00:00.000Z'
        });
    });

    it('derives only weekly fields when limits[] contains just a weekly_all entry (no session entry)', () => {
        expect(parseUsageApiResponse(weeklyOnlyLimitsResponseBody)).toEqual({
            weeklyUsage: 44,
            weeklyResetAt: '2030-06-07T00:00:00.000Z'
        });
    });

    it('takes the first match when limits[] has duplicate kind: session entries (documents current find() behavior)', () => {
        expect(parseUsageApiResponse(duplicateSessionKindResponseBody)).toEqual({
            sessionUsage: 12,
            sessionResetAt: '2030-06-01T00:00:00.000Z'
        });
    });

    // Known limitation (#343 vs #503 ambiguity) - see the comment on
    // nullBucketsWithLiveLimitsResponseBody above. This locks the current,
    // deliberately-accepted behavior in place: whole-bucket null keeps the
    // #343 zero-pin on percent even when a live limits[] could otherwise
    // supply a real percentage, while resets_at still falls back to
    // limits[] independently, which can recreate the "frozen percent, live
    // timer" symptom from #503 for this specific payload shape.
    it('keeps percent pinned to 0 for whole-bucket null buckets even with live limits[] data, while resets_at still falls back (known #343/#503 overlap)', () => {
        expect(parseUsageApiResponse(nullBucketsWithLiveLimitsResponseBody)).toEqual({
            sessionUsage: 0,
            sessionResetAt: '2030-07-01T00:00:00.000Z',
            weeklyUsage: 0,
            weeklyResetAt: '2030-07-07T00:00:00.000Z'
        });
    });
});
