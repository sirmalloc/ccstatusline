import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import { getTranscriptAnalysis } from '../jsonl';
import { getTranscriptSessionName } from '../jsonl-session';

const tempRoots: string[] = [];

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('transcript session names', () => {
    it.each([
        {
            name: 'latest automatic title',
            records: [
                { type: 'ai-title', aiTitle: 'Initial title' },
                { type: 'ai-title', aiTitle: 'Updated title' }
            ],
            expected: 'Updated title'
        },
        {
            name: 'latest rename before a newer automatic title',
            records: [
                { type: 'custom-title', customTitle: 'Old name' },
                { type: 'ai-title', aiTitle: 'Automatic title' },
                { type: 'custom-title', customTitle: 'My name' },
                { type: 'ai-title', aiTitle: 'Later automatic title' }
            ],
            expected: 'My name'
        },
        {
            name: 'rename following an automatic title',
            records: [
                { type: 'ai-title', aiTitle: 'Automatic title' },
                { type: 'custom-title', customTitle: 'My name' }
            ],
            expected: 'My name'
        },
        {
            name: 'valid automatic title before malformed title records',
            records: [
                { type: 'ai-title', aiTitle: 'Valid title' },
                { type: 'ai-title', aiTitle: '' },
                { type: 'ai-title', aiTitle: 42 },
                { type: 'custom-title', customTitle: '' },
                { type: 'custom-title', customTitle: null }
            ],
            expected: 'Valid title'
        },
        {
            name: 'no valid title',
            records: [
                { type: 'message', aiTitle: 'Not a title record' },
                { type: 'ai-title', aiTitle: null }
            ],
            expected: null
        }
    ])('uses the $name in both scan paths', async ({ records, expected }) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jsonl-title-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'session.jsonl');
        fs.writeFileSync(transcriptPath, records.map(record => JSON.stringify(record)).join('\n'));

        const analysis = await getTranscriptAnalysis(transcriptPath, { includeSessionName: true });

        expect(analysis.sessionName).toBe(expected);
        expect(getTranscriptSessionName(transcriptPath)).toBe(expected);
    });
});
