import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

// The row Claude Code writes when a request is rejected (a usage limit, an
// expired login, an outage): its usage is all zeros
function makeApiErrorLine(timestamp: Date): string {
    return JSON.stringify({
        type: 'assistant',
        timestamp: timestamp.toISOString(),
        isApiErrorMessage: true,
        message: {
            model: '<synthetic>',
            stop_reason: 'stop_sequence',
            usage: {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0
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

    it.each(['claude (work)', 'cfg[1]', 'brace{a}', 'star*x', 'q?mark'])('finds transcripts under a config directory named %j', (dirName) => {
        const configDir = path.join(tempClaudeDir, dirName);
        process.env.CLAUDE_CONFIG_DIR = configDir;
        const projectsDir = path.join(configDir, 'projects', 'project-a');
        fs.mkdirSync(projectsDir, { recursive: true });

        const now = new Date();
        const blockStartSource = new Date(now.getTime() - (30 * 60 * 1000));
        const recentActivity = new Date(now.getTime() - (10 * 60 * 1000));

        fs.writeFileSync(path.join(projectsDir, 'session.jsonl'), [
            makeUsageLine(blockStartSource),
            makeUsageLine(recentActivity)
        ].join('\n'));

        const metrics = getBlockMetrics();

        expect(metrics?.startTime.toISOString()).toBe(floorToHourUtc(blockStartSource).toISOString());
    });

    it('returns null when the only recent rows are rejected requests', () => {
        const projectsDir = path.join(tempClaudeDir, 'projects', 'project-a');
        fs.mkdirSync(projectsDir, { recursive: true });
        const transcriptPath = path.join(projectsDir, 'session.jsonl');

        const now = new Date();
        fs.writeFileSync(transcriptPath, [
            makeApiErrorLine(new Date(now.getTime() - (170 * 60 * 1000))),
            makeApiErrorLine(new Date(now.getTime() - (120 * 60 * 1000))),
            makeApiErrorLine(new Date(now.getTime() - (45 * 60 * 1000)))
        ].join('\n'));

        const metrics = getBlockMetrics();

        expect(metrics).toBeNull();
    });

    it('starts the block at the first real request after rejected ones', () => {
        const projectsDir = path.join(tempClaudeDir, 'projects', 'project-a');
        fs.mkdirSync(projectsDir, { recursive: true });
        const transcriptPath = path.join(projectsDir, 'session.jsonl');

        const now = new Date();
        const firstRealRequest = new Date(now.getTime() - (45 * 60 * 1000));
        const recentActivity = new Date(now.getTime() - (10 * 60 * 1000));

        fs.writeFileSync(transcriptPath, [
            makeApiErrorLine(new Date(now.getTime() - (170 * 60 * 1000))),
            makeApiErrorLine(new Date(now.getTime() - (160 * 60 * 1000))),
            makeUsageLine(firstRealRequest),
            makeUsageLine(recentActivity)
        ].join('\n'));

        const metrics = getBlockMetrics();

        expect(metrics?.startTime.toISOString()).toBe(floorToHourUtc(firstRealRequest).toISOString());
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
