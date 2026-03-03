import * as fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    clearActivitySnapshotCache,
    getActivitySnapshot,
    parseActivityContent
} from '../activity';

function makeToolUseLine(id: string, name: string, input: Record<string, unknown>, timestamp: string): string {
    return JSON.stringify({
        timestamp,
        message: {
            content: [
                {
                    type: 'tool_use',
                    id,
                    name,
                    input
                }
            ]
        }
    });
}

function makeToolResultLine(toolUseId: string, timestamp: string, isError = false): string {
    return JSON.stringify({
        timestamp,
        message: {
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    is_error: isError
                }
            ]
        }
    });
}

describe('activity parsing', () => {
    beforeEach(() => {
        clearActivitySnapshotCache();
    });

    afterEach(() => {
        clearActivitySnapshotCache();
    });

    it('parses tool, agent, and todo activity from transcript content', () => {
        const content = [
            makeToolUseLine('tool-1', 'Read', { file_path: '/repo/src/auth.ts' }, '2026-03-03T00:00:00.000Z'),
            makeToolResultLine('tool-1', '2026-03-03T00:00:01.000Z'),
            makeToolUseLine('agent-1', 'Task', { subagent_type: 'explore', model: 'haiku', description: 'Find auth flow' }, '2026-03-03T00:00:02.000Z'),
            makeToolResultLine('agent-1', '2026-03-03T00:00:05.000Z'),
            makeToolUseLine('todo-write-1', 'TodoWrite', {
                todos: [
                    { id: 'task-1', content: 'Investigate auth bug', status: 'in_progress' },
                    { id: 'task-2', content: 'Add tests', status: 'pending' }
                ]
            }, '2026-03-03T00:00:06.000Z'),
            makeToolUseLine('todo-update-1', 'TaskUpdate', {
                taskId: 'task-2',
                status: 'completed'
            }, '2026-03-03T00:00:07.000Z')
        ].join('\n');

        const snapshot = parseActivityContent(content);

        expect(snapshot.tools).toHaveLength(1);
        expect(snapshot.tools[0]).toMatchObject({
            id: 'tool-1',
            name: 'Read',
            target: '/repo/src/auth.ts',
            status: 'completed'
        });

        expect(snapshot.agents).toHaveLength(1);
        expect(snapshot.agents[0]).toMatchObject({
            id: 'agent-1',
            type: 'explore',
            model: 'haiku',
            description: 'Find auth flow',
            status: 'completed'
        });

        expect(snapshot.todos).toEqual([
            { content: 'Investigate auth bug', status: 'in_progress' },
            { content: 'Add tests', status: 'completed' }
        ]);
        expect(snapshot.updatedAt?.toISOString()).toBe('2026-03-03T00:00:07.000Z');
    });

    it('handles malformed lines and unknown todo statuses safely', () => {
        const content = [
            'not-json',
            makeToolUseLine('todo-create-1', 'TaskCreate', { subject: 'Draft proposal', status: 'not_started' }, '2026-03-03T00:00:00.000Z'),
            makeToolUseLine('todo-update-1', 'TaskUpdate', { taskId: '1', status: 'unknown-status' }, '2026-03-03T00:00:01.000Z')
        ].join('\n');

        const snapshot = parseActivityContent(content);
        expect(snapshot.todos).toEqual([
            { content: 'Draft proposal', status: 'pending' }
        ]);
    });

    it('respects configured caps for tools and agents', () => {
        const content = [
            makeToolUseLine('tool-1', 'Read', { file_path: '/repo/1.ts' }, '2026-03-03T00:00:00.000Z'),
            makeToolUseLine('tool-2', 'Read', { file_path: '/repo/2.ts' }, '2026-03-03T00:00:01.000Z'),
            makeToolUseLine('tool-3', 'Read', { file_path: '/repo/3.ts' }, '2026-03-03T00:00:02.000Z'),
            makeToolUseLine('agent-1', 'Task', { subagent_type: 'a' }, '2026-03-03T00:00:03.000Z'),
            makeToolUseLine('agent-2', 'Task', { subagent_type: 'b' }, '2026-03-03T00:00:04.000Z')
        ].join('\n');

        const snapshot = parseActivityContent(content, { maxTools: 2, maxAgents: 1 });
        expect(snapshot.tools.map(tool => tool.id)).toEqual(['tool-2', 'tool-3']);
        expect(snapshot.agents.map(agent => agent.id)).toEqual(['agent-2']);
    });
});

describe('activity cache', () => {
    let tempDir = '';

    beforeEach(() => {
        clearActivitySnapshotCache();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-activity-test-'));
    });

    afterEach(() => {
        clearActivitySnapshotCache();
        if (tempDir) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            tempDir = '';
        }
    });

    it('uses cached snapshot when transcript file metadata is unchanged', () => {
        const line = makeToolUseLine('tool-1', 'Read', { file_path: '/repo/a.ts' }, '2026-03-03T00:00:00.000Z');
        const transcriptPath = path.join(tempDir, 'activity.jsonl');
        fs.writeFileSync(transcriptPath, `${line}\n`, 'utf-8');

        const first = getActivitySnapshot(transcriptPath);
        const second = getActivitySnapshot(transcriptPath);

        expect(first.tools).toHaveLength(1);
        expect(second.tools).toHaveLength(1);
        expect(second).toBe(first);
    });

    it('re-parses when transcript metadata changes', () => {
        const firstLine = makeToolUseLine('tool-1', 'Read', { file_path: '/repo/a.ts' }, '2026-03-03T00:00:00.000Z');
        const secondLine = makeToolUseLine('tool-2', 'Edit', { file_path: '/repo/longer-path-name-b.ts' }, '2026-03-03T00:01:00.000Z');
        const transcriptPath = path.join(tempDir, 'activity.jsonl');
        fs.writeFileSync(transcriptPath, `${firstLine}\n`, 'utf-8');

        const first = getActivitySnapshot(transcriptPath);
        fs.writeFileSync(transcriptPath, `${secondLine}\n`, 'utf-8');
        const second = getActivitySnapshot(transcriptPath);

        expect(first.tools[0]?.id).toBe('tool-1');
        expect(second.tools[0]?.id).toBe('tool-2');
        expect(second).not.toBe(first);
    });
});
