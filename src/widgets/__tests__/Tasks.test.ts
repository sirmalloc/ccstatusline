import * as fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { TasksWidget } from '../Tasks';

function makeToolUse(name: string, input?: Record<string, unknown>): string {
    return JSON.stringify({
        timestamp: '2026-01-01T00:00:00.000Z',
        message: { content: [{ type: 'tool_use', id: `${name}-id`, name, input }] }
    });
}

function render(transcriptPath?: string, rawValue = false, isPreview = false): string | null {
    const widget = new TasksWidget();
    const context: RenderContext = {
        data: transcriptPath ? { transcript_path: transcriptPath } : undefined,
        isPreview
    };
    const item: WidgetItem = {
        id: 'tasks',
        type: 'tasks',
        rawValue
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('TasksWidget', () => {
    const tempRoots: string[] = [];

    afterEach(() => {
        while (tempRoots.length > 0) {
            const root = tempRoots.pop();
            if (root) {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    });

    it('renders preview text', () => {
        expect(render(undefined, false, true)).toBe('Tasks: Add tests (2/5)');
        expect(render(undefined, true, true)).toBe('Add tests (2/5)');
    });

    it('returns null when there are no tasks', () => {
        expect(render('/tmp/missing-tasks-transcript.jsonl')).toBeNull();
    });

    it('renders the current in-progress task with progress', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-tasks-widget-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tasks.jsonl');
        fs.writeFileSync(transcriptPath, makeToolUse('TodoWrite', {
            todos: [
                { content: 'Done task', status: 'completed' },
                { content: 'Current task', status: 'in_progress' },
                { content: 'Pending task', status: 'pending' }
            ]
        }));

        expect(render(transcriptPath)).toBe('Tasks: Current task (1/3)');
        expect(render(transcriptPath, true)).toBe('Current task (1/3)');
    });

    it('renders done summary when all tasks are completed', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-tasks-widget-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tasks-done.jsonl');
        fs.writeFileSync(transcriptPath, makeToolUse('TodoWrite', {
            todos: [
                { content: 'Done task 1', status: 'completed' },
                { content: 'Done task 2', status: 'completed' }
            ]
        }));

        expect(render(transcriptPath)).toBe('Tasks: done (2/2)');
    });

    it('truncates very long task content', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-tasks-widget-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tasks-long.jsonl');
        fs.writeFileSync(transcriptPath, makeToolUse('TodoWrite', {
            todos: [
                { content: 'Done task', status: 'completed' },
                { content: 'This is a very long in progress task title that should be truncated for display', status: 'in_progress' }
            ]
        }));

        expect(render(transcriptPath)).toBe('Tasks: This is a very long in progress task title that... (1/2)');
    });
});