import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { saveClaudeSettings } from '../../utils/claude-settings';
import { loadClaudeStatusLineState } from '../claude-status';

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
let testClaudeConfigDir = '';

beforeEach(() => {
    testClaudeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-claude-status-'));
    process.env.CLAUDE_CONFIG_DIR = testClaudeConfigDir;
});

afterEach(() => {
    if (testClaudeConfigDir) {
        fs.rmSync(testClaudeConfigDir, { recursive: true, force: true });
    }
});

afterAll(() => {
    if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
});

describe('loadClaudeStatusLineState', () => {
    it('loads both the installed command and refresh interval from Claude settings', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: 'npx -y ccstatusline@latest',
                padding: 0,
                refreshInterval: 10
            }
        });

        await expect(loadClaudeStatusLineState()).resolves.toEqual({
            existingStatusLine: 'npx -y ccstatusline@latest',
            refreshInterval: 10
        });
    });

    it('returns null refreshInterval when Claude settings do not define one', async () => {
        await saveClaudeSettings({
            statusLine: {
                type: 'command',
                command: 'npx -y ccstatusline@latest',
                padding: 0
            }
        });

        await expect(loadClaudeStatusLineState()).resolves.toEqual({
            existingStatusLine: 'npx -y ccstatusline@latest',
            refreshInterval: null
        });
    });
});