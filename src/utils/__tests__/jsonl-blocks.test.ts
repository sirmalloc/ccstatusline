import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { getBlockMetrics } from '../jsonl';

function floorToHourUtc(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
}

function makeUsageLine(timestamp: Date): string {
    return JSON.stringify({
        timestamp: timestamp.toISOString(),
        message: {
            usage: {
                input_tokens: 100,
                output_tokens: 50
            }
        }
    });
}

describe('jsonl block metrics integration', () => {
    let tempClaudeDir: string;
    let originalClaudeConfigDir: string | undefined;

    beforeEach(() => {
        tempClaudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-blocks-'));
        originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = tempClaudeDir;
    });

    afterEach(() => {
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
        }
        fs.rmSync(tempClaudeDir, { recursive: true, force: true });
    });

    it('returns the current block start for recent activity after an older session gap', () => {
        const projectsDir = path.join(tempClaudeDir, 'projects', 'project-a');
        fs.mkdirSync(projectsDir, { recursive: true });
        const transcriptPath = path.join(projectsDir, 'session.jsonl');

        const now = new Date();
        const oldActivity = new Date(now.getTime() - (10 * 60 * 60 * 1000));
        const currentBlockStartSource = new Date(now.getTime() - (2 * 60 * 60 * 1000) - (10 * 60 * 1000));
        const recentActivity = new Date(now.getTime() - (40 * 60 * 1000));

        fs.writeFileSync(transcriptPath, [
            makeUsageLine(oldActivity),
            makeUsageLine(currentBlockStartSource),
            makeUsageLine(recentActivity)
        ].join('\n'));

        const metrics = getBlockMetrics();

        expect(metrics).not.toBeNull();
        expect(metrics?.startTime.toISOString()).toBe(floorToHourUtc(currentBlockStartSource).toISOString());
        expect(metrics?.lastActivity.toISOString()).toBe(recentActivity.toISOString());
    });

    it('returns null when the most recent activity is older than the session window', () => {
        const projectsDir = path.join(tempClaudeDir, 'projects', 'project-a');
        fs.mkdirSync(projectsDir, { recursive: true });
        const transcriptPath = path.join(projectsDir, 'stale-session.jsonl');

        const now = new Date();
        const staleActivity = new Date(now.getTime() - (6 * 60 * 60 * 1000));

        fs.writeFileSync(transcriptPath, makeUsageLine(staleActivity));

        const metrics = getBlockMetrics();

        expect(metrics).toBeNull();
    });
});