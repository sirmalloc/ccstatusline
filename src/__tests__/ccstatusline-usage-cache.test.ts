import type * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    expect,
    it
} from 'vitest';

const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;
const entryPath = fileURLToPath(new URL('../ccstatusline.ts', import.meta.url));

it.each([180, 900])('uses the configured %s-second usage TTL through the CLI render path', (usageCacheTtlSeconds) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-usage-ttl-'));
    try {
        const configDir = path.join(home, 'claude');
        fs.mkdirSync(configDir);
        fs.writeFileSync(path.join(configDir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } }));
        // A local stub prevents all access to the real macOS credential store.
        const bin = path.join(home, 'bin');
        fs.mkdirSync(bin);
        const security = path.join(bin, 'security');
        fs.writeFileSync(security, '#!/bin/sh\n/bin/cat "$CLAUDE_CONFIG_DIR/.credentials.json"\n');
        fs.chmodSync(security, 0o755);
        const cacheDir = path.join(home, '.cache', 'ccstatusline');
        fs.mkdirSync(cacheDir, { recursive: true });
        const configHash = createHash('sha256').update(path.resolve(configDir)).digest('hex').slice(0, 16);
        const tokenHash = createHash('sha256').update('test-token').digest('hex').slice(0, 16);
        const cacheFile = path.join(cacheDir, `usage-${configHash}.json`);
        fs.writeFileSync(cacheFile, JSON.stringify({ sessionUsage: 5, tokenHash }));
        const nowMs = fs.statSync(cacheFile).mtimeMs + 300000;
        const settingsPath = path.join(home, 'settings.json');
        fs.writeFileSync(settingsPath, JSON.stringify({
            version: 4,
            usageCacheTtlSeconds,
            lines: [[{ id: 'usage', type: 'session-usage', rawValue: true }]],
            colorLevel: 0
        }));
        const requestsPath = path.join(home, 'requests.txt');
        const preload = path.join(home, 'preload.cjs');
        // Count attempted requests and fail locally; no network request can run.
        fs.writeFileSync(preload, `
const fs = require('node:fs');
require('node:https').request = () => {
    fs.appendFileSync(${JSON.stringify(requestsPath)}, 'request\\n');
    throw new Error('isolated test: HTTP disabled');
};
Date.now = () => ${nowMs};
`);
        const output = execFileSync(process.execPath, ['--preload', preload, entryPath, '--config', settingsPath], {
            input: '{}',
            encoding: 'utf8',
            cwd: home,
            timeout: 10000,
            env: {
                ...process.env,
                HOME: home,
                USERPROFILE: home,
                CLAUDE_CONFIG_DIR: configDir,
                CLAUDE_SECURESTORAGE_CONFIG_DIR: configDir,
                PATH: bin,
                NO_PROXY: '*',
                no_proxy: '*'
            }
        });
        expect(output.trim()).toContain('5');
        expect(fs.existsSync(requestsPath)).toBe(usageCacheTtlSeconds === 180);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
