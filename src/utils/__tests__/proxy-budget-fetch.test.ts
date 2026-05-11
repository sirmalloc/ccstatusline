import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as https from 'https';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    PROXY_BUDGET_PRESETS,
    fetchProxyBudget,
    isProxyBudgetPreset,
    type ProxyBudgetFetchOptions
} from '../proxy-budget-fetch';

const BASE_URL_ENV = 'TEST_PROXY_BASE_URL';
const TOKEN_ENV = 'TEST_PROXY_TOKEN';
const BASE_URL = 'https://proxy.example.com';
const TOKEN = 'test-token';

interface MockResponse {
    status?: number;
    body?: string;
    error?: Error;
    timeout?: boolean;
}

function mockHttpsRequest(response: MockResponse): {
    spy: ReturnType<typeof vi.spyOn>;
    lastHeaders: Record<string, string>;
} {
    const captured: Record<string, string> = {};
    const spy = vi.spyOn(https, 'request').mockImplementation(((opts: unknown, cb?: unknown) => {
        const headers = (opts as { headers?: Record<string, string> }).headers ?? {};
        Object.assign(captured, headers);
        const req = new EventEmitter() as EventEmitter & {
            end: () => void;
            destroy: () => void;
            setTimeout: (ms: number, fn: () => void) => void;
        };
        let timeoutFn: (() => void) | null = null;
        req.setTimeout = (_ms, fn) => { timeoutFn = fn; };
        req.destroy = () => { /* no-op */ };
        req.end = () => {
            setImmediate(() => {
                if (response.timeout) {
                    if (timeoutFn)
                        timeoutFn();
                    return;
                }
                if (response.error) {
                    req.emit('error', response.error);
                    return;
                }
                const res = new EventEmitter() as EventEmitter & { statusCode: number };
                res.statusCode = response.status ?? 200;
                if (typeof cb === 'function') {
                    (cb as (r: typeof res) => void)(res);
                }
                setImmediate(() => {
                    res.emit('data', Buffer.from(response.body ?? ''));
                    res.emit('end');
                });
            });
        };
        return req;
    }) as never);
    return { spy, lastHeaders: captured };
}

function clearCache(): void {
    const cacheFile = `${process.env.HOME}/.cache/ccstatusline/proxy-budget.json`;
    const lockFile = `${process.env.HOME}/.cache/ccstatusline/proxy-budget.lock`;
    try { fs.unlinkSync(cacheFile); } catch { /* ignore */ }
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
}

function defaultOpts(): ProxyBudgetFetchOptions {
    return { baseUrlEnv: BASE_URL_ENV, tokenEnv: TOKEN_ENV };
}

describe('fetchProxyBudget', () => {
    beforeEach(() => {
        process.env[BASE_URL_ENV] = BASE_URL;
        process.env[TOKEN_ENV] = TOKEN;
        clearCache();
    });

    afterEach(() => {
        Reflect.deleteProperty(process.env, BASE_URL_ENV);
        Reflect.deleteProperty(process.env, TOKEN_ENV);
        vi.restoreAllMocks();
        clearCache();
    });

    it('resolves spend/budget/percentage from a LiteLLM-shaped /key/info response', async () => {
        mockHttpsRequest({
            body: JSON.stringify({
                info: {
                    spend: 5,
                    max_budget: 50,
                    budget_reset_at: '2026-01-01T00:00:00Z'
                }
            })
        });
        const data = await fetchProxyBudget(defaultOpts());
        expect(data).not.toBeNull();
        expect(data?.spend).toBe(5);
        expect(data?.budget).toBe(50);
        expect(data?.percentage).toBeCloseTo(10);
        expect(data?.resetAt).toBe('2026-01-01T00:00:00Z');
    });

    it('returns null when tokenEnv is unset, without calling https', async () => {
        Reflect.deleteProperty(process.env, TOKEN_ENV);
        const mock = mockHttpsRequest({ body: '{}' });
        const data = await fetchProxyBudget(defaultOpts());
        expect(data).toBeNull();
        expect(mock.spy).not.toHaveBeenCalled();
    });

    it('supports custom dotted JSON paths (OpenRouter-style shape)', async () => {
        mockHttpsRequest({ body: JSON.stringify({ data: { usage: 12, limit: 30 } }) });
        const data = await fetchProxyBudget({
            ...defaultOpts(),
            spendPath: 'data.usage',
            budgetPath: 'data.limit'
        });
        expect(data?.spend).toBe(12);
        expect(data?.budget).toBe(30);
        expect(data?.percentage).toBeCloseTo(40);
    });

    it('returns null when a configured field is missing from the response', async () => {
        mockHttpsRequest({ body: JSON.stringify({ info: { max_budget: 50 } }) });
        const data = await fetchProxyBudget(defaultOpts());
        expect(data).toBeNull();
    });

    it('returns null on non-2xx HTTP status', async () => {
        mockHttpsRequest({ status: 503, body: '' });
        const data = await fetchProxyBudget(defaultOpts());
        expect(data).toBeNull();
    });

    it('returns null on malformed JSON body', async () => {
        mockHttpsRequest({ body: 'not json' });
        const data = await fetchProxyBudget(defaultOpts());
        expect(data).toBeNull();
    });

    it('returns null when spend grossly exceeds budget (likely misconfigured spendPath)', async () => {
        mockHttpsRequest({ body: JSON.stringify({ info: { spend: 99999, max_budget: 50 } }) });
        const data = await fetchProxyBudget(defaultOpts());
        expect(data).toBeNull();
    });

    it('returns null on request timeout', async () => {
        mockHttpsRequest({ timeout: true });
        const data = await fetchProxyBudget({ ...defaultOpts(), timeoutMs: 50 });
        expect(data).toBeNull();
    });

    it('uses Authorization: Bearer header by default', async () => {
        const { lastHeaders } = mockHttpsRequest({ body: JSON.stringify({ info: { spend: 1, max_budget: 10 } }) });
        await fetchProxyBudget(defaultOpts());
        expect(lastHeaders.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('uses x-api-key header when authScheme is x-api-key', async () => {
        const { lastHeaders } = mockHttpsRequest({ body: JSON.stringify({ info: { spend: 1, max_budget: 10 } }) });
        await fetchProxyBudget({ ...defaultOpts(), authScheme: 'x-api-key' });
        expect(lastHeaders['x-api-key']).toBe(TOKEN);
        expect(lastHeaders.Authorization).toBeUndefined();
    });

    it('serves fresh cache on subsequent invocations within TTL without calling https again', async () => {
        const mock = mockHttpsRequest({ body: JSON.stringify({ info: { spend: 7, max_budget: 50 } }) });
        const first = await fetchProxyBudget({ ...defaultOpts(), cacheTtlSec: 60 });
        const second = await fetchProxyBudget({ ...defaultOpts(), cacheTtlSec: 60 });
        expect(first?.spend).toBe(7);
        expect(second?.spend).toBe(7);
        expect(mock.spy).toHaveBeenCalledTimes(1);
    });

    it('falls back to stale cache after a fetch failure when within stale window', async () => {
        // Seed cache with a real response.
        mockHttpsRequest({ body: JSON.stringify({ info: { spend: 3, max_budget: 50 } }) });
        await fetchProxyBudget({ ...defaultOpts(), cacheTtlSec: 1 });

        // Wait > ttl so cache is stale (but well within 10x).
        await new Promise(resolve => setTimeout(resolve, 1100));
        vi.restoreAllMocks();

        // Now have the next request fail.
        mockHttpsRequest({ status: 500, body: '' });
        const data = await fetchProxyBudget({ ...defaultOpts(), cacheTtlSec: 1 });
        expect(data?.spend).toBe(3);
    });

    it('returns null when neither network nor cache yield data', async () => {
        mockHttpsRequest({ error: new Error('network down') });
        const data = await fetchProxyBudget(defaultOpts());
        expect(data).toBeNull();
    });

    it('preset=litellm uses /key/info with info.spend/info.max_budget paths', async () => {
        mockHttpsRequest({ body: JSON.stringify({ info: { spend: 4, max_budget: 40, budget_reset_at: '2026-02-01T00:00:00Z' } }) });
        const data = await fetchProxyBudget({ ...defaultOpts(), preset: 'litellm' });
        expect(data?.spend).toBe(4);
        expect(data?.budget).toBe(40);
        expect(data?.percentage).toBeCloseTo(10);
        expect(data?.resetAt).toBe('2026-02-01T00:00:00Z');
    });

    it('preset=openrouter resolves /api/v1/key with data.usage/data.limit/data.limit_reset', async () => {
        mockHttpsRequest({ body: JSON.stringify({ data: { usage: 8, limit: 20, limit_reset: '2026-03-01T00:00:00Z' } }) });
        const data = await fetchProxyBudget({ ...defaultOpts(), preset: 'openrouter' });
        expect(data?.spend).toBe(8);
        expect(data?.budget).toBe(20);
        expect(data?.percentage).toBeCloseTo(40);
        expect(data?.resetAt).toBe('2026-03-01T00:00:00Z');
    });

    it('user-supplied paths override preset defaults', async () => {
        mockHttpsRequest({ body: JSON.stringify({ custom: { my_spend: 6, my_cap: 60 } }) });
        const data = await fetchProxyBudget({
            ...defaultOpts(),
            preset: 'openrouter',
            spendPath: 'custom.my_spend',
            budgetPath: 'custom.my_cap'
        });
        expect(data?.spend).toBe(6);
        expect(data?.budget).toBe(60);
    });

    it('isProxyBudgetPreset accepts every registered preset key and rejects unknown ones', () => {
        for (const key of Object.keys(PROXY_BUDGET_PRESETS)) {
            expect(isProxyBudgetPreset(key)).toBe(true);
        }
        expect(isProxyBudgetPreset('bogus-proxy')).toBe(false);
        expect(isProxyBudgetPreset('')).toBe(false);
    });

    it('every registered preset has a fully-specified shape', () => {
        for (const [name, def] of Object.entries(PROXY_BUDGET_PRESETS)) {
            expect(def.endpoint, name).toMatch(/\$\{baseUrl\}/);
            expect(def.spendPath, name).toBeTruthy();
            expect(def.budgetPath, name).toBeTruthy();
            expect(def.resetAtPath, name).toBeTruthy();
            expect(['bearer', 'x-api-key']).toContain(def.authScheme);
        }
    });
});
