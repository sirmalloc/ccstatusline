import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface BunSpawnResult {
    exitCode: number | null;
    stdout: Buffer;
    stderr: Buffer;
}

interface BunRuntime { spawnSync(command: string[], options: { env: NodeJS.ProcessEnv; stdout: 'pipe'; stderr: 'pipe'; timeout?: number }): BunSpawnResult }

// Other suites mock node:child_process and that mock leaks across files under
// the bun runner, so subprocesses are spawned through Bun.spawnSync there;
// vitest/Node keeps test files isolated and takes the real spawnSync.
function runProcess(command: string, args: string[], options: { env: NodeJS.ProcessEnv; timeout?: number }): string {
    const bun = (globalThis as { Bun?: BunRuntime }).Bun;

    if (bun) {
        const result = bun.spawnSync([command, ...args], {
            env: options.env,
            stdout: 'pipe',
            stderr: 'pipe',
            ...(options.timeout !== undefined ? { timeout: options.timeout } : {})
        });
        if (result.exitCode !== 0) {
            throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr.toString().slice(0, 400)}`);
        }
        return result.stdout.toString();
    }

    const result = spawnSync(command, args, {
        env: options.env,
        encoding: 'utf8',
        ...(options.timeout !== undefined ? { timeout: options.timeout } : {})
    });
    if (result.error !== undefined) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr.slice(0, 400)}`);
    }
    return result.stdout;
}

// Shared subprocess harness for usage-fetch tests. The probe source is bundled
// with bun (extensionless imports resolve) and executed with node, whose
// os.homedir() honors HOME: with HOME pointed at a temp directory, the usage
// cache and lock files the probe reads and writes live in that temp home and
// never touch the live ones. In-process isolation is impossible here (bun's
// homedir() ignores HOME). The https.request spy is installed by a --require
// patch that runs before the bundle: a CJS-require mutation alone would not
// reach the bundle's ESM import bindings.

export interface ProbeResult {
    calls: number;
    agentPresent: boolean[];
    lockExistsAfter: boolean;
    lockContentsAfter: string | null;
    resultKind: string | null;
}

export interface ProbeHandle {
    root: string;
    bin: string;
    claudeConfigDir: string;
    probeBundle: string;
    patchPath: string;
}

export function createProbe(): ProbeHandle {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ccsl-usage-probe-'));
    const home = path.join(root, 'home');
    const bin = path.join(root, 'bin');
    const claudeConfigDir = path.join(root, 'claude-config');
    const probeEntry = path.join(root, 'probe-usage.mjs');
    const probeBundle = path.join(root, 'probe-usage.bundle.mjs');
    const patchPath = path.join(root, 'patch.cjs');

    mkdirSync(home, { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(claudeConfigDir, { recursive: true });
    writeFileSync(path.join(bin, 'security'), '#!/bin/sh\n/bin/cat "$CLAUDE_CONFIG_DIR/.credentials.json"\n');
    chmodSync(path.join(bin, 'security'), 0o755);
    writeFileSync(
        path.join(claudeConfigDir, '.credentials.json'),
        JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } })
    );

    const usageModulePath = fileURLToPath(new URL('../usage.ts', import.meta.url));
    writeFileSync(
        probeEntry,
        `
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as usageModule from ${JSON.stringify(usageModulePath)};

const lockFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.lock');
// createUsageMemoryCache exists only on the request-scoped-cache code; older
// trees take the plain requiredFields call
const probeOptions = usageModule.createUsageMemoryCache
    ? { requiredFields: [], cache: usageModule.createUsageMemoryCache() }
    : { requiredFields: [] };
const first = await usageModule.fetchUsageData(probeOptions);
process.stdout.write(JSON.stringify({
    ...(globalThis.__probe ?? { calls: 0, agentPresent: [] }),
    lockExistsAfter: fs.existsSync(lockFile),
    lockContentsAfter: fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : null,
    resultKind: first.error ?? null
}));
`
    );
    writeFileSync(
        patchPath,
        `
if (process.env.USAGE_PROBE_OBSERVE === '1') {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { EventEmitter } = require('node:events');
    const https = require('node:https');
    globalThis.__probe = { calls: 0, agentPresent: [] };
    const responseBody = process.env.USAGE_PROBE_RESPONSE_BODY;
    https.request = function (...args) {
        globalThis.__probe.calls += 1;
        const callback = args.find(v => typeof v === 'function');
        const options = args.find(v => v !== null && typeof v === 'object' && !Buffer.isBuffer(v)) || {};
        globalThis.__probe.agentPresent.push(Boolean(options.agent));
        const request = new EventEmitter();
        request.end = () => {
            const lockDuring = process.env.TEST_LOCK_DURING_REQUEST;
            if (lockDuring !== undefined) {
                const lockFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.lock');
                fs.writeFileSync(lockFile, lockDuring);
            }
            if (responseBody === undefined) {
                setTimeout(() => request.emit('error', new Error('probe: no network')), 10);
                return request;
            }
            if (callback) {
                callback({
                    statusCode: 200,
                    headers: {},
                    setEncoding() {},
                    on(event, handler) {
                        if (event === 'data') {
                            handler(responseBody);
                        }
                        if (event === 'end') {
                            handler();
                        }
                        return this;
                    }
                });
            }
            return request;
        };
        request.destroy = () => request;
        request.setTimeout = () => request;
        request.on = EventEmitter.prototype.on;
        return request;
    };
}
`
    );

    runProcess('bun', ['build', probeEntry, '--outfile', probeBundle, '--target=node'], { env: { ...process.env } });

    return { root, bin, claudeConfigDir, probeBundle, patchPath };
}

export interface RunProbeOptions {
    observe?: boolean;
    httpsProxy?: string;
    lockDuringRequest?: string;
    noProxy?: string;
    lowercaseNoProxy?: string;
    /** Serve a 200 response with this body instead of a request error. */
    responseBody?: string;
    /** Kill the probe process after this many ms (a hung render fails the test). */
    timeoutMs?: number;
}

export function runUsageProbe(handle: ProbeHandle, options: RunProbeOptions = {}): ProbeResult {
    const env: NodeJS.ProcessEnv = {
        HOME: path.join(handle.root, 'home'),
        USERPROFILE: path.join(handle.root, 'home'),
        CLAUDE_CONFIG_DIR: handle.claudeConfigDir,
        PATH: `${handle.bin}${path.delimiter}${process.env.PATH ?? ''}`
    };

    if (options.observe === true) {
        env.USAGE_PROBE_OBSERVE = '1';
    }
    if (options.httpsProxy !== undefined) {
        env.HTTPS_PROXY = options.httpsProxy;
    }
    if (options.noProxy !== undefined) {
        env.NO_PROXY = options.noProxy;
    }
    if (options.lowercaseNoProxy !== undefined) {
        env.no_proxy = options.lowercaseNoProxy;
    }
    if (options.lockDuringRequest !== undefined) {
        env.TEST_LOCK_DURING_REQUEST = options.lockDuringRequest;
    }
    if (options.responseBody !== undefined) {
        env.USAGE_PROBE_RESPONSE_BODY = options.responseBody;
    }

    const output = runProcess('node', ['--require', handle.patchPath, handle.probeBundle], {
        env,
        timeout: options.timeoutMs
    });

    return JSON.parse(output) as ProbeResult;
}

export function cleanupProbe(handle: ProbeHandle): void {
    rmSync(handle.root, { recursive: true, force: true });
}
