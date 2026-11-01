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

import type { AccountEmailResult } from '../../types/AccountEmail';

const require = createRequire(import.meta.url);
const { spawn: realSpawn } = require('node:child_process') as typeof childProcess;
const NOW = 2200000000000;
const modulePath = fileURLToPath(new URL('../usage-fetch.ts', import.meta.url));

interface ProbeResult {
    result: AccountEmailResult;
    requests: number;
}

interface Probe {
    ready: string;
    release: () => void;
    done: Promise<ProbeResult>;
}

let root: string;
let home: string;
let sequence: number;
let children: childProcess.ChildProcess[];
let completions: Promise<ProbeResult>[];

function accountPath(token: string, extension: string): string {
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 16);
    return path.join(home, '.cache', 'ccstatusline', `account-email-${hash}.${extension}`);
}

function startProbe(token: string, outcome: 'success' | 'error' | 'rate-limited', now = NOW): Probe {
    const id = String(sequence++);
    const configDir = path.join(root, `profile-${token}`);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: token } }));
    const ready = path.join(root, `${id}.ready`);
    const gate = path.join(root, `${id}.gate`);
    const env = { ...process.env };
    delete env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
    delete env.HTTPS_PROXY;
    delete env.NO_PROXY;
    delete env.no_proxy;
    const child = realSpawn(process.execPath, [path.join(root, 'probe.mjs')], {
        env: {
            ...env,
            HOME: home,
            USERPROFILE: home,
            CLAUDE_CONFIG_DIR: configDir,
            PATH: path.join(root, 'bin'),
            PROBE_READY: ready,
            PROBE_GATE: gate,
            PROBE_OUTCOME: outcome,
            PROBE_NOW: String(now)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    children.push(child);
    const done = new Promise<ProbeResult>((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => { stdout += String(data); });
        child.stderr.on('data', (data) => { stderr += String(data); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Probe exited ${code}: ${stderr}`));
                return;
            }
            try {
                resolve(JSON.parse(stdout) as ProbeResult);
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    });
    // Teardown awaits every child, including those interrupted by a failed test.
    void done.catch(() => undefined);
    completions.push(done);
    return { ready, done, release: () => { fs.writeFileSync(gate, ''); } };
}

async function waitForRequest(probe: Probe): Promise<void> {
    const deadline = Date.now() + 4000;
    while (!fs.existsSync(probe.ready)) {
        if (Date.now() >= deadline) {
            throw new Error('Probe did not start its mocked request');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-email-concurrency-'));
    home = path.join(root, 'home');
    sequence = 0;
    children = [];
    completions = [];
    fs.mkdirSync(home);
    fs.mkdirSync(path.join(root, 'bin'));
    // Keep every macOS credential lookup inside the temporary fixture.
    fs.writeFileSync(path.join(root, 'bin', 'security'), '#!/bin/sh\n/bin/cat "$CLAUDE_CONFIG_DIR/.credentials.json"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'probe.mjs'), `
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const https = require('node:https');
Date.now = () => Number(process.env.PROBE_NOW);
let requests = 0;
https.request = (options, callback) => {
    requests++;
    const request = new EventEmitter();
    let timer;
    request.destroy = () => clearInterval(timer);
    request.end = () => {
        fs.writeFileSync(process.env.PROBE_READY, '');
        timer = setInterval(() => {
            if (!fs.existsSync(process.env.PROBE_GATE)) return;
            clearInterval(timer);
            if (process.env.PROBE_OUTCOME === 'error') {
                request.emit('error', new Error('mock request failure'));
                return;
            }
            const response = new EventEmitter();
            response.headers = { 'retry-after': '120' };
            response.statusCode = process.env.PROBE_OUTCOME === 'rate-limited' ? 429 : 200;
            response.setEncoding = () => {};
            callback(response);
            const token = options.headers.Authorization.slice('Bearer '.length);
            response.emit('data', JSON.stringify({ account: { email: token + '@example.com' } }));
            response.emit('end');
        }, 10);
    };
    return request;
};
const { fetchAccountEmail } = await import(${JSON.stringify(modulePath)});
const result = await fetchAccountEmail();
process.stdout.write(JSON.stringify({ result, requests }));
`);
});

afterEach(async () => {
    for (const child of children) {
        if (child.exitCode === null) {
            child.kill();
        }
    }
    await Promise.allSettled(completions);
    fs.rmSync(root, { recursive: true, force: true });
});

describe('account-email cross-process coordination', () => {
    it('allows only one request for an uncached login and retains its 429 deadline', async () => {
        const owner = startProbe('shared', 'rate-limited');
        await waitForRequest(owner);
        const competing = startProbe('shared', 'error');
        expect(await competing.done).toEqual({ result: { status: 'unavailable' }, requests: 0 });
        expect(fs.existsSync(competing.ready)).toBe(false);
        owner.release();
        expect((await owner.done).requests).toBe(1);
        const lock = JSON.parse(fs.readFileSync(accountPath('shared', 'lock'), 'utf8')) as { blockedUntil: number };
        expect(lock.blockedUntil).toBe(NOW / 1000 + 120);
        expect(fs.existsSync(accountPath('shared', 'inflight'))).toBe(false);
        expect(await startProbe('shared', 'error', NOW + 31000).done).toEqual({ result: { status: 'unavailable' }, requests: 0 });
    });

    it('does not shorten a longer deadline written while its request was in flight', async () => {
        const probe = startProbe('long-backoff', 'error');
        await waitForRequest(probe);
        const tokenHash = createHash('sha256').update('long-backoff').digest('hex').slice(0, 16);
        fs.writeFileSync(accountPath('long-backoff', 'lock'), JSON.stringify({ tokenHash, blockedUntil: NOW / 1000 + 120 }));
        probe.release();
        expect((await probe.done).result).toEqual({ status: 'unavailable' });
        const lock = JSON.parse(fs.readFileSync(accountPath('long-backoff', 'lock'), 'utf8')) as { blockedUntil: number };
        expect(lock.blockedUntil).toBe(NOW / 1000 + 120);
        expect((await startProbe('long-backoff', 'error', NOW + 31000).done).requests).toBe(0);
    });

    it.each([false, true])('keeps both concurrent successful logins cached (reverse response order: %s)', async (reverse) => {
        const first = startProbe('first', 'success');
        const second = startProbe('second', 'success');
        await Promise.all([waitForRequest(first), waitForRequest(second)]);
        for (const probe of reverse ? [second, first] : [first, second]) {
            probe.release();
            expect((await probe.done).requests).toBe(1);
        }
        for (const token of ['first', 'second']) {
            expect(await startProbe(token, 'error').done).toEqual({
                result: { status: 'available', email: `${token}@example.com` },
                requests: 0
            });
        }
    });

    it('recovers a stale incomplete lease left by a crashed writer', async () => {
        const leasePath = accountPath('incomplete', 'inflight');
        fs.mkdirSync(path.dirname(leasePath), { recursive: true });
        fs.writeFileSync(leasePath, '{');
        fs.utimesSync(leasePath, NOW / 1000 - 60, NOW / 1000 - 60);
        const probe = startProbe('incomplete', 'success');
        await waitForRequest(probe);
        probe.release();
        expect((await probe.done).result).toEqual({ status: 'available', email: 'incomplete@example.com' });
        expect(fs.existsSync(leasePath)).toBe(false);
    });

    it('recovers an abandoned lease and rejects the expired owner response', async () => {
        const abandoned = startProbe('expired', 'error');
        await waitForRequest(abandoned);
        const replacement = startProbe('expired', 'rate-limited', NOW + 31000);
        await waitForRequest(replacement);
        replacement.release();
        await replacement.done;
        const lockBefore = fs.readFileSync(accountPath('expired', 'lock'), 'utf8');
        abandoned.release();
        await abandoned.done;
        expect(fs.readFileSync(accountPath('expired', 'lock'), 'utf8')).toBe(lockBefore);
    });
});
