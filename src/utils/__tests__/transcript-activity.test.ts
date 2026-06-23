import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import { getTranscriptActivity } from '../transcript-activity';

function makeToolUse(id: string, name: string, input?: Record<string, unknown>): string {
    return JSON.stringify({
        timestamp: '2026-01-01T00:00:00.000Z',
        message: { content: [{ type: 'tool_use', id, name, input }] }
    });
}

function makeToolResult(toolUseId: string, isError = false): string {
    return JSON.stringify({
        timestamp: '2026-01-01T00:00:01.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError }] }
    });
}

describe('transcript activity', () => {
    const tempRoots: string[] = [];

    afterEach(() => {
        while (tempRoots.length > 0) {
            const root = tempRoots.pop();
            if (root) {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    });

    it('returns empty activity for missing transcript files', () => {
        expect(getTranscriptActivity('/tmp/transcript-activity-missing.jsonl')).toEqual({
            tools: [],
            tasks: []
        });
    });

    it('extracts tool states and ignores Task agent entries', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-transcript-activity-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tools.jsonl');
        fs.writeFileSync(transcriptPath, [
            makeToolUse('tool-1', 'Read', { file_path: '/tmp/example.txt' }),
            makeToolResult('tool-1'),
            makeToolUse('tool-2', 'Edit', { file_path: '/tmp/project/src/auth.ts' }),
            makeToolUse('agent-1', 'Task', { subagent_type: 'explore' }),
            makeToolResult('agent-1'),
            makeToolUse('tool-3', 'Bash', { command: 'git status --short --branch --untracked-files=no' }),
            makeToolResult('tool-3', true)
        ].join('\n'));

        const activity = getTranscriptActivity(transcriptPath);

        expect(activity.tools).toEqual([
            { id: 'tool-1', name: 'Read', target: '/tmp/example.txt', status: 'completed' },
            { id: 'tool-2', name: 'Edit', target: '/tmp/project/src/auth.ts', status: 'running' },
            { id: 'tool-3', name: 'Bash', target: 'git status --short --branch --...', status: 'error' }
        ]);
    });

    it('tracks tasks across TodoWrite, TaskCreate, TaskUpdate, and deleted updates', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-transcript-activity-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tasks.jsonl');
        fs.writeFileSync(transcriptPath, [
            makeToolUse('todo-1', 'TodoWrite', {
                todos: [
                    { content: 'First task', status: 'completed' },
                    { content: 'Second task', status: 'in_progress' }
                ]
            }),
            makeToolUse('task-1', 'TaskCreate', { taskId: 'alpha', subject: 'Third task' }),
            makeToolUse('task-2', 'TaskCreate', { taskId: 'beta', subject: 'Fourth task', status: 'in_progress' }),
            makeToolUse('task-3', 'TaskUpdate', { taskId: 'alpha', status: 'completed' }),
            makeToolUse('task-4', 'TaskUpdate', { taskId: 'beta', subject: 'Fourth task renamed', status: 'completed' }),
            makeToolUse('task-5', 'TaskUpdate', { taskId: '1', status: 'deleted' })
        ].join('\n'));

        const activity = getTranscriptActivity(transcriptPath);

        expect(activity.tasks).toEqual([
            { content: 'Second task', status: 'in_progress' },
            { content: 'Third task', status: 'completed' },
            { content: 'Fourth task renamed', status: 'completed' }
        ]);
    });

    it('reuses cached data when transcript state has not changed', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-transcript-activity-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'cache.jsonl');
        fs.writeFileSync(transcriptPath, makeToolUse('tool-1', 'Read', { file_path: '/tmp/example.txt' }));

        const first = getTranscriptActivity(transcriptPath);
        const second = getTranscriptActivity(transcriptPath);

        expect(second).toEqual(first);
    });
});