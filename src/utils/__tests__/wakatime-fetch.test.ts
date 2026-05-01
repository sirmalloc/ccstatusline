import { EventEmitter } from 'events';
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
    WAKATIME_CACHE_TTL_MS,
    fetchWakatimeData,
    parseWakatimeApiKey,
    readWakatimeApiKey,
    resolveWakatimeConfigPath,
    type WakatimeFetchDeps
} from '../wakatime-fetch';

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_WAKATIME_HOME = process.env.WAKATIME_HOME;

let tempHome: string;

function makeDeps(overrides: Partial<WakatimeFetchDeps>): WakatimeFetchDeps {
    return {
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        readFileSync: fs.readFileSync,
        statSync: fs.statSync,
        writeFileSync: fs.writeFileSync,
        getHomedir: os.homedir,
        now: Date.now,
        getEnv: () => process.env,
        // unused by default; tests will override per case
        httpsRequest: ((options: unknown, callback: unknown) => {
            void options;
            void callback;
            throw new Error('httpsRequest not stubbed');
        }) as unknown as WakatimeFetchDeps['httpsRequest'],
        ...overrides
    };
}

interface FakeRequestController {
    succeedWith(body: string, status?: number): void;
    failWith(error?: Error): void;
    timeout(): void;
}

function makeFakeHttpsRequest(controllerRef: { current: FakeRequestController | null }): WakatimeFetchDeps['httpsRequest'] {
    return ((options: unknown, callback: (response: EventEmitter & { statusCode?: number; setEncoding: (enc: string) => void }) => void) => {
        void options;
        const request = new EventEmitter() as EventEmitter & {
            end: () => void;
            destroy: () => void;
        };
        request.end = () => { /* noop */ };
        request.destroy = () => { /* noop */ };

        controllerRef.current = {
            succeedWith(body: string, status = 200): void {
                const response = new EventEmitter() as EventEmitter & {
                    statusCode?: number;
                    setEncoding: (enc: string) => void;
                };
                response.statusCode = status;
                response.setEncoding = () => { /* noop */ };
                callback(response);
                process.nextTick(() => {
                    response.emit('data', body);
                    response.emit('end');
                });
            },
            failWith(error: Error = new Error('boom')): void {
                process.nextTick(() => {
                    request.emit('error', error);
                });
            },
            timeout(): void {
                process.nextTick(() => {
                    request.emit('timeout');
                });
            }
        };
        return request;
    }) as unknown as WakatimeFetchDeps['httpsRequest'];
}

describe('parseWakatimeApiKey', () => {
    it('returns the api_key from the [settings] section', () => {
        const cfg = '[settings]\napi_key = waka_abc123\n';
        expect(parseWakatimeApiKey(cfg)).toBe('waka_abc123');
    });

    it('accepts the apikey alias', () => {
        const cfg = '[settings]\napikey=waka_xyz\n';
        expect(parseWakatimeApiKey(cfg)).toBe('waka_xyz');
    });

    it('ignores commented lines and other sections', () => {
        const cfg = '# top comment\n[other]\napi_key = nope\n[settings]\n; comment\napi_key = waka_real\n';
        expect(parseWakatimeApiKey(cfg)).toBe('waka_real');
    });

    it('returns null when the file has no api_key', () => {
        expect(parseWakatimeApiKey('[settings]\nignore_ip = false\n')).toBeNull();
    });

    it('returns null when api_key value is empty', () => {
        expect(parseWakatimeApiKey('[settings]\napi_key =\n')).toBeNull();
    });
});

describe('resolveWakatimeConfigPath', () => {
    beforeEach(() => {
        tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wakatime-cfg-test-'));
        delete process.env.WAKATIME_HOME;
        process.env.HOME = tempHome;
    });

    afterEach(() => {
        fs.rmSync(tempHome, { recursive: true, force: true });
        if (ORIGINAL_HOME === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = ORIGINAL_HOME;
        }
        if (ORIGINAL_WAKATIME_HOME === undefined) {
            delete process.env.WAKATIME_HOME;
        } else {
            process.env.WAKATIME_HOME = ORIGINAL_WAKATIME_HOME;
        }
        vi.restoreAllMocks();
    });

    it('falls back to homedir when WAKATIME_HOME is unset', () => {
        const deps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({})
        });
        expect(resolveWakatimeConfigPath(deps)).toBe(path.join(tempHome, '.wakatime.cfg'));
    });

    it('honors the WAKATIME_HOME env override', () => {
        const overrideHome = path.join(tempHome, 'override');
        fs.mkdirSync(overrideHome, { recursive: true });
        const deps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({ WAKATIME_HOME: overrideHome })
        });
        expect(resolveWakatimeConfigPath(deps)).toBe(path.join(overrideHome, '.wakatime.cfg'));
    });
});

describe('readWakatimeApiKey', () => {
    beforeEach(() => {
        tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wakatime-cfg-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempHome, { recursive: true, force: true });
    });

    it('returns null when the config file is missing', () => {
        const deps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({})
        });
        expect(readWakatimeApiKey(deps)).toBeNull();
    });

    it('reads the api_key from the config file', () => {
        const cfgPath = path.join(tempHome, '.wakatime.cfg');
        fs.writeFileSync(cfgPath, '[settings]\napi_key = waka_test_123\n');
        const deps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({})
        });
        expect(readWakatimeApiKey(deps)).toBe('waka_test_123');
    });
});

describe('fetchWakatimeData', () => {
    let cacheDirRoot: string;

    beforeEach(() => {
        tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wakatime-fetch-test-'));
        cacheDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wakatime-cache-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempHome, { recursive: true, force: true });
        fs.rmSync(cacheDirRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('returns no-credentials when no api_key is configured', async () => {
        const deps = makeDeps({
            getHomedir: () => cacheDirRoot,
            getEnv: () => ({})
        });
        const result = await fetchWakatimeData(deps);
        expect(result).toEqual({ error: 'no-credentials' });
    });

    it('calls the API and returns parsed grand_total fields on cache miss', async () => {
        const cfgPath = path.join(tempHome, '.wakatime.cfg');
        fs.writeFileSync(cfgPath, '[settings]\napi_key = waka_secret_key\n');

        const controllerRef: { current: FakeRequestController | null } = { current: null };
        const deps = makeDeps({
            getHomedir: () => {
                // First call resolves config path; later calls go to cache root.
                return tempHome;
            },
            getEnv: () => ({}),
            httpsRequest: makeFakeHttpsRequest(controllerRef)
        });

        const promise = fetchWakatimeData(deps);
        // Defer until the request handler is registered.
        await new Promise(resolve => setImmediate(resolve));
        controllerRef.current?.succeedWith(JSON.stringify({ data: { grand_total: { digital: '6:25', text: '6 hrs 25 mins', decimal: '6.42', total_seconds: 23100 } } }));

        const result = await promise;
        expect(result).toEqual({
            digital: '6:25',
            text: '6 hrs 25 mins',
            decimal: '6.42',
            totalSeconds: 23100
        });
    });

    it('returns timeout when the request times out', async () => {
        const cfgPath = path.join(tempHome, '.wakatime.cfg');
        fs.writeFileSync(cfgPath, '[settings]\napi_key = waka_secret_key\n');

        const controllerRef: { current: FakeRequestController | null } = { current: null };
        const deps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({}),
            httpsRequest: makeFakeHttpsRequest(controllerRef)
        });

        const promise = fetchWakatimeData(deps);
        await new Promise(resolve => setImmediate(resolve));
        controllerRef.current?.timeout();
        const result = await promise;
        expect(result).toEqual({ error: 'timeout' });
    });

    it('returns api-error when the request fails', async () => {
        const cfgPath = path.join(tempHome, '.wakatime.cfg');
        fs.writeFileSync(cfgPath, '[settings]\napi_key = waka_secret_key\n');

        const controllerRef: { current: FakeRequestController | null } = { current: null };
        const deps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({}),
            httpsRequest: makeFakeHttpsRequest(controllerRef)
        });

        const promise = fetchWakatimeData(deps);
        await new Promise(resolve => setImmediate(resolve));
        controllerRef.current?.failWith();
        const result = await promise;
        expect(result).toEqual({ error: 'api-error' });
    });

    it('returns parse-error when the response body is not valid JSON', async () => {
        const cfgPath = path.join(tempHome, '.wakatime.cfg');
        fs.writeFileSync(cfgPath, '[settings]\napi_key = waka_secret_key\n');

        const controllerRef: { current: FakeRequestController | null } = { current: null };
        const deps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({}),
            httpsRequest: makeFakeHttpsRequest(controllerRef)
        });

        const promise = fetchWakatimeData(deps);
        await new Promise(resolve => setImmediate(resolve));
        controllerRef.current?.succeedWith('not json{}');
        const result = await promise;
        expect(result).toEqual({ error: 'parse-error' });
    });

    it('returns the disk cache when fresh and skips the network', async () => {
        const cfgPath = path.join(tempHome, '.wakatime.cfg');
        fs.writeFileSync(cfgPath, '[settings]\napi_key = waka_cache_key\n');

        const httpsCalls: string[] = [];
        const fakeHttps: WakatimeFetchDeps['httpsRequest'] = ((options: unknown) => {
            httpsCalls.push(JSON.stringify(options));
            const request = new EventEmitter() as EventEmitter & {
                end: () => void;
                destroy: () => void;
            };
            request.end = () => { /* noop */ };
            request.destroy = () => { /* noop */ };
            return request;
        }) as unknown as WakatimeFetchDeps['httpsRequest'];

        const controllerRef: { current: FakeRequestController | null } = { current: null };
        const populatingDeps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({}),
            httpsRequest: makeFakeHttpsRequest(controllerRef)
        });

        const populating = fetchWakatimeData(populatingDeps);
        await new Promise(resolve => setImmediate(resolve));
        controllerRef.current?.succeedWith(JSON.stringify({ data: { grand_total: { digital: '1:30' } } }));
        await populating;

        // Second call shares the same homedir → reuses the cache file. We
        // also assert no HTTP requests are fired this time.
        const cachedDeps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({}),
            httpsRequest: fakeHttps,
            now: () => Date.now()
        });

        const cached = await fetchWakatimeData(cachedDeps);
        expect(cached.digital).toBe('1:30');
        expect(httpsCalls).toHaveLength(0);
    });

    it('falls through to a fresh fetch when the cache is older than the TTL', async () => {
        const cfgPath = path.join(tempHome, '.wakatime.cfg');
        fs.writeFileSync(cfgPath, '[settings]\napi_key = waka_stale_key\n');

        const controllerRef: { current: FakeRequestController | null } = { current: null };
        const populatingDeps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({}),
            httpsRequest: makeFakeHttpsRequest(controllerRef)
        });

        const populating = fetchWakatimeData(populatingDeps);
        await new Promise(resolve => setImmediate(resolve));
        controllerRef.current?.succeedWith(JSON.stringify({ data: { grand_total: { digital: '0:30' } } }));
        await populating;

        // Now pretend wall-clock has advanced past the TTL — a stale cache
        // file is present, but should be ignored, and a new fetch fires.
        const staleControllerRef: { current: FakeRequestController | null } = { current: null };
        const staleDeps = makeDeps({
            getHomedir: () => tempHome,
            getEnv: () => ({}),
            now: () => Date.now() + WAKATIME_CACHE_TTL_MS + 5_000,
            httpsRequest: makeFakeHttpsRequest(staleControllerRef)
        });

        const refetch = fetchWakatimeData(staleDeps);
        await new Promise(resolve => setImmediate(resolve));
        staleControllerRef.current?.succeedWith(JSON.stringify({ data: { grand_total: { digital: '0:45' } } }));
        const result = await refetch;
        expect(result.digital).toBe('0:45');
    });
});
