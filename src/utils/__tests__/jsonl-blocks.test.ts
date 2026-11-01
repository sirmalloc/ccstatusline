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

function hoursAgo(now: Date, hours: number): Date {
    return new Date(now.getTime() - (hours * 60 * 60 * 1000));
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

// A session left open since yesterday: one row 30h ago, then one every 30
// minutes from 9h ago, so its own rows show a 21h gap
function writeResumedSession(claudeDir: string, now: Date): void {
    const projectDir = path.join(claudeDir, 'projects', 'project-a');
    fs.mkdirSync(projectDir, { recursive: true });
    const rows = [hoursAgo(now, 30)];
    for (let hours = 9; hours > 0; hours -= 0.5) {
        rows.push(hoursAgo(now, hours));
    }
    fs.writeFileSync(path.join(projectDir, 'session.jsonl'), rows.map(row => makeUsageLine(row)).join('\n'));
}

// Another project's session with rows the given hours ago, last written at the newest
function writeOtherProjectSession(claudeDir: string, now: Date, rowHoursAgo: number[]): void {
    const projectDir = path.join(claudeDir, 'projects', 'project-b');
    fs.mkdirSync(projectDir, { recursive: true });
    const transcriptPath = path.join(projectDir, 'session.jsonl');
    fs.writeFileSync(transcriptPath, rowHoursAgo.map(hours => makeUsageLine(hoursAgo(now, hours))).join('\n'));
    const lastWritten = hoursAgo(now, Math.min(...rowHoursAgo));
    fs.utimesSync(transcriptPath, lastWritten, lastWritten);
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

    // Windows forbids * and ? in directory names.
    const globDirectoryNames = ['claude (work)', 'cfg[1]', 'brace{a}', 'star*x', 'q?mark']
        .filter(dirName => process.platform !== 'win32' || !/[*?]/.test(dirName));

    it.each(globDirectoryNames)('finds transcripts under a config directory named %j', (dirName) => {
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

    it('ignores rows that are not served requests or lack a valid timestamp', () => {
        const projectsDir = path.join(tempClaudeDir, 'projects', 'project-a');
        fs.mkdirSync(projectsDir, { recursive: true });
        const transcriptPath = path.join(projectsDir, 'session.jsonl');

        const now = new Date();
        const realRequest = new Date(now.getTime() - (45 * 60 * 1000));
        const ignoredRowTime = new Date(now.getTime() - (10 * 60 * 1000));
        const usage = { input_tokens: 100, output_tokens: 50 };

        fs.writeFileSync(transcriptPath, [
            JSON.stringify({ timestamp: 'not a date', message: { usage } }),
            '{not json',
            JSON.stringify({ type: 'user', timestamp: ignoredRowTime.toISOString(), message: { content: 'hello' } }),
            JSON.stringify({ timestamp: ignoredRowTime.toISOString(), message: { usage: { input_tokens: 100 } } }),
            JSON.stringify({ timestamp: ignoredRowTime.toISOString(), message: { usage: { output_tokens: 50 } } }),
            JSON.stringify({ timestamp: ignoredRowTime.toISOString(), isSidechain: true, message: { usage } }),
            JSON.stringify({ timestamp: ignoredRowTime.getTime(), message: { usage } }),
            makeUsageLine(realRequest)
        ].join('\n'));

        const metrics = getBlockMetrics();

        expect(metrics?.startTime.toISOString()).toBe(floorToHourUtc(realRequest).toISOString());
        expect(metrics?.lastActivity.toISOString()).toBe(realRequest.toISOString());
    });

    it('reads further back when a gap reaches past the lookback, since an older transcript may fill it', () => {
        const now = new Date();
        writeResumedSession(tempClaudeDir, now);
        // Last written 10.5h ago, just outside the first lookback, and fills the gap
        writeOtherProjectSession(tempClaudeDir, now, [12, 11.5, 11, 10.5]);

        const metrics = getBlockMetrics();

        // One chain from 12h ago, through blocks starting about 7h and 2h ago
        expect(metrics?.startTime.toISOString()).toBe(floorToHourUtc(hoursAgo(now, 2)).toISOString());
    });

    it('still ends the block chain at a gap that no older transcript fills', () => {
        const now = new Date();
        writeResumedSession(tempClaudeDir, now);
        // Inside the gap, but more than 5h before the session resumed
        writeOtherProjectSession(tempClaudeDir, now, [27, 26]);

        const metrics = getBlockMetrics();

        // One chain from 9h ago, through a block starting about 4h ago
        expect(metrics?.startTime.toISOString()).toBe(floorToHourUtc(hoursAgo(now, 4)).toISOString());
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

    it('finds the current block in a transcript with more usage rows than a call takes arguments', () => {
        const projectsDir = path.join(tempClaudeDir, 'projects', 'project-a');
        fs.mkdirSync(projectsDir, { recursive: true });
        const transcriptPath = path.join(projectsDir, 'long-session.jsonl');

        const now = new Date();
        const oldActivity = new Date(now.getTime() - (10 * 60 * 60 * 1000));
        const recentActivity = new Date(now.getTime() - (40 * 60 * 1000));
        // More rows than Node (about 125k) or Bun (about 640k) accepts as
        // arguments to a single function call. The older row ends the lookback
        // at its session gap, so the file is read once.
        const rowCount = 700_000;
        const recentLine = `${makeUsageLine(recentActivity)}\n`;
        fs.writeFileSync(transcriptPath, `${makeUsageLine(oldActivity)}\n${recentLine.repeat(rowCount)}`);

        const metrics = getBlockMetrics();

        expect(metrics?.startTime.toISOString()).toBe(floorToHourUtc(recentActivity).toISOString());
        expect(metrics?.lastActivity.toISOString()).toBe(recentActivity.toISOString());
    }, 30000);
});
