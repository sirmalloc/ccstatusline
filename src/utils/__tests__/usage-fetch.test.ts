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

interface UsageProbeResult {
    first: Record<string, unknown>;
    second: Record<string, unknown>;
    lockExists: boolean;
    cacheExists: boolean;
    requestCount: number;
}

describe('fetchUsageData error handling', () => {
    it('preserves root errors within lock window and avoids locking on no-credentials', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-usage-test-'));
        const probeScriptPath = path.join(tempRoot, 'probe-usage.mjs');
        const usageModulePath = fileURLToPath(new URL('../usage.ts', import.meta.url));

        const noCredentialsHome = path.join(tempRoot, 'home-no-credentials');
        const apiErrorHome = path.join(tempRoot, 'home-api-error');
        const apiErrorBin = path.join(tempRoot, 'bin-api-error');
        const apiErrorClaudeConfig = path.join(tempRoot, 'claude-api-error');
        const successHome = path.join(tempRoot, 'home-success');
        const successBin = path.join(tempRoot, 'bin-success');
        const successClaudeConfig = path.join(tempRoot, 'claude-success');
        const securityScript = path.join(apiErrorBin, 'security');
        const successSecurityScript = path.join(successBin, 'security');
        const credentialsFile = path.join(apiErrorClaudeConfig, '.credentials.json');
        const successCredentialsFile = path.join(successClaudeConfig, '.credentials.json');
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

        fs.mkdirSync(noCredentialsHome, { recursive: true });
        fs.mkdirSync(apiErrorHome, { recursive: true });
        fs.mkdirSync(apiErrorBin, { recursive: true });
        fs.mkdirSync(apiErrorClaudeConfig, { recursive: true });
        fs.mkdirSync(successHome, { recursive: true });
        fs.mkdirSync(successBin, { recursive: true });
        fs.mkdirSync(successClaudeConfig, { recursive: true });

        fs.writeFileSync(securityScript, '#!/bin/sh\necho \'{"claudeAiOauth":{"accessToken":"test-token"}}\'\n');
        fs.chmodSync(securityScript, 0o755);
        fs.writeFileSync(credentialsFile, JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } }));
        fs.writeFileSync(successSecurityScript, '#!/bin/sh\necho \'{"claudeAiOauth":{"accessToken":"test-token"}}\'\n');
        fs.chmodSync(successSecurityScript, 0o755);
        fs.writeFileSync(successCredentialsFile, JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } }));

        const probeScript = `
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const https = require('https');
const mode = process.env.TEST_REQUEST_MODE || 'success';
const responseBody = process.env.TEST_RESPONSE_BODY || '';
let requestCount = 0;

https.request = (...args) => {
    requestCount += 1;
    const callback = args.find(value => typeof value === 'function');
    const requestHandlers = new Map();
    const responseHandlers = new Map();

    const response = {
        statusCode: mode === 'success' ? 200 : 500,
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

            if (mode === 'success') {
                if (callback) {
                    callback(response);
                }
                const dataHandlers = responseHandlers.get('data') || [];
                for (const handler of dataHandlers) {
                    handler(Buffer.from(responseBody));
                }
                const endHandlers = responseHandlers.get('end') || [];
                for (const handler of endHandlers) {
                    handler();
                }
                return;
            }

            const handlers = requestHandlers.get('error') || [];
            for (const handler of handlers) {
                handler(new Error('unexpected request'));
            }
        }
    };

    return request;
};

const { fetchUsageData } = await import(${JSON.stringify(usageModulePath)});

const lockFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.lock');
const cacheFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.json');
const nowMs = Number(process.env.TEST_NOW_MS || Date.now());
Date.now = () => nowMs;

const first = await fetchUsageData();
const second = await fetchUsageData();
process.stdout.write(JSON.stringify({
    first,
    second,
    lockExists: fs.existsSync(lockFile),
    cacheExists: fs.existsSync(cacheFile),
    requestCount
}));
`;

        try {
            fs.writeFileSync(probeScriptPath, probeScript);

            const noCredentialsOutput = execFileSync(process.execPath, [probeScriptPath], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    HOME: noCredentialsHome,
                    PATH: '/nonexistent',
                    TEST_REQUEST_MODE: 'unexpected',
                    TEST_NOW_MS: '2200000000000'
                }
            });

            const noCredentialsResult = JSON.parse(noCredentialsOutput) as UsageProbeResult;
            expect(noCredentialsResult.first).toEqual({ error: 'no-credentials' });
            expect(noCredentialsResult.second).toEqual({ error: 'no-credentials' });
            expect(noCredentialsResult.lockExists).toBe(false);
            expect(noCredentialsResult.cacheExists).toBe(false);
            expect(noCredentialsResult.requestCount).toBe(0);

            const apiErrorOutput = execFileSync(process.execPath, [probeScriptPath], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    HOME: apiErrorHome,
                    PATH: apiErrorBin,
                    CLAUDE_CONFIG_DIR: apiErrorClaudeConfig,
                    TEST_REQUEST_MODE: 'error',
                    TEST_NOW_MS: '2200000000000'
                }
            });

            const apiErrorResult = JSON.parse(apiErrorOutput) as UsageProbeResult;
            expect(apiErrorResult.first).toEqual({ error: 'api-error' });
            expect(apiErrorResult.second).toEqual({ error: 'api-error' });
            expect(apiErrorResult.cacheExists).toBe(false);
            expect(apiErrorResult.requestCount).toBe(1);

            const successOutput = execFileSync(process.execPath, [probeScriptPath], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    HOME: successHome,
                    PATH: successBin,
                    CLAUDE_CONFIG_DIR: successClaudeConfig,
                    TEST_REQUEST_MODE: 'success',
                    TEST_RESPONSE_BODY: successResponseBody,
                    TEST_NOW_MS: '2200000000000'
                }
            });

            const successResult = JSON.parse(successOutput) as UsageProbeResult;
            expect(successResult.first).toEqual({
                sessionUsage: 42,
                sessionResetAt: '2030-01-01T00:00:00.000Z',
                weeklyUsage: 17,
                weeklyResetAt: '2030-01-07T00:00:00.000Z'
            });
            expect(successResult.second).toEqual(successResult.first);
            expect(successResult.cacheExists).toBe(true);
            expect(successResult.requestCount).toBe(1);

            const cachedSuccessOutput = execFileSync(process.execPath, [probeScriptPath], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    HOME: successHome,
                    PATH: successBin,
                    CLAUDE_CONFIG_DIR: successClaudeConfig,
                    TEST_REQUEST_MODE: 'unexpected',
                    TEST_NOW_MS: '2200000000000'
                }
            });

            const cachedSuccessResult = JSON.parse(cachedSuccessOutput) as UsageProbeResult;
            expect(cachedSuccessResult.first).toEqual(successResult.first);
            expect(cachedSuccessResult.second).toEqual(successResult.first);
            expect(cachedSuccessResult.cacheExists).toBe(true);
            expect(cachedSuccessResult.requestCount).toBe(1);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});