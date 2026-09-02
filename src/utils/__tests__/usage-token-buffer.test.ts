import * as childProcess from 'child_process';
import { createRequire } from 'module';
import type { Mock } from 'vitest';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { getUsageToken } from '../usage-fetch';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const require = createRequire(import.meta.url);
const { execFileSync: realExecFileSync } = require('node:child_process') as { execFileSync: typeof childProcess.execFileSync };
const mockedExecFileSync = childProcess.execFileSync as Mock;

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
const ORIGINAL_SECURESTORAGE_CONFIG_DIR = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;

describe('getUsageToken dump-keychain behavior', () => {
    beforeEach(() => {
        // The candidate scan under test only runs for the default profile, so
        // shed any config-dir variables leaking in from the environment.
        delete process.env.CLAUDE_CONFIG_DIR;
        delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
        mockedExecFileSync.mockReset();
        mockedExecFileSync.mockImplementation(realExecFileSync);
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    });

    afterEach(() => {
        delete process.env.CLAUDE_CONFIG_DIR;
        delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
        if (ORIGINAL_CLAUDE_CONFIG_DIR !== undefined) {
            process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
        }
        if (ORIGINAL_SECURESTORAGE_CONFIG_DIR !== undefined) {
            process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = ORIGINAL_SECURESTORAGE_CONFIG_DIR;
        }
        vi.restoreAllMocks();
        mockedExecFileSync.mockReset();
        mockedExecFileSync.mockImplementation(realExecFileSync);
    });

    it('uses an expanded maxBuffer when dumping keychains for hashed fallbacks', () => {
        let dumpMaxBuffer: number | undefined;

        mockedExecFileSync.mockImplementation((command: string, args?: string[], options?: { maxBuffer?: number }) => {
            if (command !== 'security') {
                return realExecFileSync(command, args, options);
            }

            if (!args) {
                throw new Error('Expected security arguments');
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials') {
                throw new Error('missing exact credential');
            }

            if (args[0] === 'dump-keychain') {
                dumpMaxBuffer = options?.maxBuffer;
                return [
                    'keychain: "/Users/example/Library/Keychains/login.keychain-db"',
                    'version: 512',
                    'class: "genp"',
                    'attributes:',
                    '    "svce"<blob>="Claude Code-credentials-hashed"',
                    '    "mdat"<timedate>="20240301010101Z"'
                ].join('\n');
            }

            if (args[0] === 'find-generic-password' && args[2] === 'Claude Code-credentials-hashed') {
                return JSON.stringify({ claudeAiOauth: { accessToken: 'hashed-token' } });
            }

            throw new Error(`Unexpected security args: ${args.join(' ')}`);
        });

        expect(getUsageToken()).toBe('hashed-token');
        expect(dumpMaxBuffer).toBe(8 * 1024 * 1024);
    });
});
