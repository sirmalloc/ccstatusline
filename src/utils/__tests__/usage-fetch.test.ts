import type * as childProcess from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    describe,
    expect,
    it
} from 'vitest';

const require = createRequire(import.meta.url);
const { execFileSync: realExecFileSync } = require('node:child_process') as { execFileSync: typeof childProcess.execFileSync };

interface UsageProbeResult {
    first: Record<string, unknown>;
    second: Record<string, unknown>;
    lockExists: boolean;
    cacheExists: boolean;
    requestCount: number;
    proxyAgentConfigured: boolean;
    requestHost: string | null;
    homedir: string;
    lockContents: string | null;
}

interface TokenHome {
    bin: string;
    claudeConfig: string;
    home: string;
}

interface ProbeOptions {
    claudeConfigDir?: string;
    home: string;
    httpsProxy?: string;
    lowercaseHttpsProxy?: string;
    mode?: 'error' | 'status' | 'success' | 'unexpected';
    nowMs: number;
    pathDir?: string;
    requiredFields?: string[];
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    statusCode?: number;
}

function createProbeHarness() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-usage-test-'));
    const probeScriptPath = path.join(tempRoot, 'probe-usage.mjs');
    const usageModulePath = fileURLToPath(new URL('../usage.ts', import.meta.url));

    const probeScript = `
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const https = require('https');
const mode = process.env.TEST_REQUEST_MODE || 'success';
const responseBody = process.env.TEST_RESPONSE_BODY || '';
const responseHeaders = JSON.parse(process.env.TEST_RESPONSE_HEADERS_JSON || '{}');
const statusCode = Number(process.env.TEST_STATUS_CODE || (mode === 'success' ? '200' : '500'));
let requestCount = 0;
let proxyAgentConfigured = false;
let requestHost = null;

https.request = (...args) => {
    requestCount += 1;
    const callback = args.find(value => typeof value === 'function');
    const options = args.find(value => value && typeof value === 'object' && !Buffer.isBuffer(value));
    proxyAgentConfigured = Boolean(options?.agent);
    requestHost = options?.hostname ?? null;
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

const { fetchUsageData } = await import(${JSON.stringify(usageModulePath)});

const lockFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.lock');
const cacheFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.json');
const nowMs = Number(process.env.TEST_NOW_MS || Date.now());
const requiredFields = JSON.parse(process.env.TEST_REQUIRED_FIELDS_JSON || '[]');
Date.now = () => nowMs;

const first = await fetchUsageData({ requiredFields });
const second = await fetchUsageData({ requiredFields });
process.stdout.write(JSON.stringify({
    first,
    second,
    lockExists: fs.existsSync(lockFile),
    cacheExists: fs.existsSync(cacheFile),
    requestCount,
    proxyAgentConfigured,
    requestHost,
    homedir: os.homedir(),
    lockContents: fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : null
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

        fs.writeFileSync(securityScript, '#!/bin/sh\necho \'{"claudeAiOauth":{"accessToken":"test-token"}}\'\n');
        fs.chmodSync(securityScript, 0o755);
        fs.writeFileSync(credentialsFile, JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } }));

        return {
            bin,
            claudeConfig,
            home
        };
    }

    function runProbe(options: ProbeOptions): UsageProbeResult {
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
            const normalizedKey = key.toUpperCase();
            return normalizedKey !== 'CLAUDE_CONFIG_DIR' && normalizedKey !== 'HTTPS_PROXY';
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
            TEST_STATUS_CODE: String(options.statusCode ?? (options.mode === 'success' ? 200 : 500))
        });

        if (options.claudeConfigDir !== undefined) {
            env.CLAUDE_CONFIG_DIR = options.claudeConfigDir;
        }

        if (options.httpsProxy !== undefined) {
            env.HTTPS_PROXY = options.httpsProxy;
        }

        if (options.lowercaseHttpsProxy !== undefined) {
            env.https_proxy = options.lowercaseHttpsProxy;
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
        createTokenHome,
        runProbe
    };
}

function parseLockContents(lockContents: string | null): { blockedUntil: number; error?: string } | null {
    return lockContents ? JSON.parse(lockContents) as { blockedUntil: number; error?: string } : null;
}

describe('fetchUsageData error handling', () => {
    const nowMs = 2200000000000;
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
            utilization: 2.6
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
    const rateLimitedResponseBody = JSON.stringify({
        error: {
            message: 'Rate limited. Please try again later.',
            type: 'rate_limit_error'
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
                extraUsageUtilization: 2.6
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

            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: nowMs + 10000,
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

            const cachedResult = harness.runProbe({
                claudeConfigDir: home.claudeConfig,
                home: home.home,
                mode: 'unexpected',
                nowMs: nowMs + 10000,
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
            const lockFile = path.join(lockDir, 'usage.lock');

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
