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
    first: { error?: string };
    second: { error?: string };
    lockExists: boolean;
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
        const securityScript = path.join(apiErrorBin, 'security');
        const credentialsFile = path.join(apiErrorClaudeConfig, '.credentials.json');

        fs.mkdirSync(noCredentialsHome, { recursive: true });
        fs.mkdirSync(apiErrorHome, { recursive: true });
        fs.mkdirSync(apiErrorBin, { recursive: true });
        fs.mkdirSync(apiErrorClaudeConfig, { recursive: true });

        fs.writeFileSync(securityScript, '#!/bin/sh\necho \'{"claudeAiOauth":{"accessToken":"test-token"}}\'\n');
        fs.chmodSync(securityScript, 0o755);
        fs.writeFileSync(credentialsFile, JSON.stringify({ claudeAiOauth: { accessToken: 'test-token' } }));

        const probeScript = `
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fetchUsageData } from ${JSON.stringify(usageModulePath)};

const lockFile = path.join(os.homedir(), '.cache', 'ccstatusline', 'usage.lock');
const nowMs = Date.now() + (10 * 365 * 24 * 60 * 60 * 1000);
Date.now = () => nowMs;

if (process.env.TEST_FORCE_BAD_EXEC_PATH === '1') {
    Object.defineProperty(process, 'execPath', {
        value: '/nonexistent-runtime',
        writable: true,
        configurable: true
    });
}

const first = fetchUsageData();
const second = fetchUsageData();
process.stdout.write(JSON.stringify({
    first,
    second,
    lockExists: fs.existsSync(lockFile)
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
                    TEST_FORCE_BAD_EXEC_PATH: '0'
                }
            });

            const noCredentialsResult = JSON.parse(noCredentialsOutput) as UsageProbeResult;
            expect(noCredentialsResult.first).toEqual({ error: 'no-credentials' });
            expect(noCredentialsResult.second).toEqual({ error: 'no-credentials' });
            expect(noCredentialsResult.lockExists).toBe(false);

            const apiErrorOutput = execFileSync(process.execPath, [probeScriptPath], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    HOME: apiErrorHome,
                    PATH: apiErrorBin,
                    CLAUDE_CONFIG_DIR: apiErrorClaudeConfig,
                    TEST_FORCE_BAD_EXEC_PATH: '1'
                }
            });

            const apiErrorResult = JSON.parse(apiErrorOutput) as UsageProbeResult;
            expect(apiErrorResult.first).toEqual({ error: 'api-error' });
            expect(apiErrorResult.second).toEqual({ error: 'api-error' });
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});