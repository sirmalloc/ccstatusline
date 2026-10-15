import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    clearTranscriptAnalysisCache,
    getTranscriptAnalysis
} from '../jsonl-metrics';

// Whole-analysis reuse (#18): unchanged transcripts are returned from cache by
// reference; any write to the main file or a subagent file forces a rescan.

let transcriptDir: string;
let transcriptPath: string;

function writeTranscript(lines: string[]): void {
    fs.writeFileSync(transcriptPath, `${lines.join('\n')}\n`);
}

function usageLine(inputTokens: number): string {
    return JSON.stringify({
        timestamp: '2026-01-01T10:00:00.000Z',
        message: { usage: { input_tokens: inputTokens, output_tokens: 50 } }
    });
}

beforeEach(() => {
    transcriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-transcript-'));
    transcriptPath = path.join(transcriptDir, 'session.jsonl');
    clearTranscriptAnalysisCache();
});

afterEach(() => {
    clearTranscriptAnalysisCache();
    fs.rmSync(transcriptDir, { recursive: true, force: true });
});

describe('transcript analysis reuse (#18)', () => {
    it('returns the same analysis object for an unchanged transcript', async () => {
        writeTranscript([usageLine(100)]);
        const first = await getTranscriptAnalysis(transcriptPath);
        const second = await getTranscriptAnalysis(transcriptPath);
        expect(second).toBe(first);
    });

    it('dedups concurrent scans of the same transcript into one', async () => {
        writeTranscript([usageLine(100)]);
        const [a, b] = await Promise.all([
            getTranscriptAnalysis(transcriptPath),
            getTranscriptAnalysis(transcriptPath)
        ]);
        expect(b).toBe(a);
    });

    it('rescans after an append to the transcript', async () => {
        writeTranscript([usageLine(100)]);
        const first = await getTranscriptAnalysis(transcriptPath);

        writeTranscript([usageLine(100), usageLine(200)]);
        const second = await getTranscriptAnalysis(transcriptPath);

        expect(second).not.toBe(first);
    });

    it('rescans after the transcript is truncated', async () => {
        writeTranscript([usageLine(100), usageLine(200), usageLine(300)]);
        const first = await getTranscriptAnalysis(transcriptPath);

        writeTranscript([usageLine(100)]);
        const second = await getTranscriptAnalysis(transcriptPath);

        expect(second).not.toBe(first);
    });

    it('rescans when a subagent transcript is appended to', async () => {
        writeTranscript([usageLine(100)]);
        const subagentsDir = path.join(transcriptDir, 'subagents');
        fs.mkdirSync(subagentsDir);
        const subagentPath = path.join(subagentsDir, 'agent-1.jsonl');
        fs.writeFileSync(subagentPath, `${usageLine(10)}\n`);
        const first = await getTranscriptAnalysis(transcriptPath);

        fs.appendFileSync(subagentPath, `${usageLine(20)}\n`);
        const second = await getTranscriptAnalysis(transcriptPath);

        expect(second).not.toBe(first);
    });

    it('rescans when a new subagent transcript appears', async () => {
        const subagentsDir = path.join(transcriptDir, 'subagents');
        fs.mkdirSync(subagentsDir);
        writeTranscript([usageLine(100)]);
        fs.writeFileSync(path.join(subagentsDir, 'agent-1.jsonl'), `${usageLine(10)}\n`);
        const first = await getTranscriptAnalysis(transcriptPath);

        fs.writeFileSync(path.join(subagentsDir, 'agent-2.jsonl'), `${usageLine(20)}\n`);
        const second = await getTranscriptAnalysis(transcriptPath);

        expect(second).not.toBe(first);
    });
});
