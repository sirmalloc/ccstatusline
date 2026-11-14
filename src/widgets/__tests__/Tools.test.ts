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
import { ToolsWidget } from '../Tools';

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

function render(transcriptPath?: string, rawValue = false, isPreview = false): string | null {
    const widget = new ToolsWidget();
    const context: RenderContext = {
        data: transcriptPath ? { transcript_path: transcriptPath } : undefined,
        isPreview
    };
    const item: WidgetItem = {
        id: 'tools',
        type: 'tools',
        rawValue
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ToolsWidget', () => {
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
        expect(render(undefined, false, true)).toBe('Tools: ◐ Edit: .../auth.ts | ✓ Read ×3');
        expect(render(undefined, true, true)).toBe('◐ Edit: .../auth.ts | ✓ Read ×3');
    });

    it('returns null when there are no tools', () => {
        expect(render('/tmp/missing-tools-transcript.jsonl')).toBeNull();
    });

    it('renders running tools followed by completion summary', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-tools-widget-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tools.jsonl');
        fs.writeFileSync(transcriptPath, [
            makeToolUse('tool-1', 'Read', { file_path: '/tmp/example.txt' }),
            makeToolResult('tool-1'),
            makeToolUse('tool-2', 'Read', { file_path: '/tmp/example-2.txt' }),
            makeToolResult('tool-2'),
            makeToolUse('tool-3', 'Edit', { file_path: '/tmp/very/long/path/to/authentication.ts' }),
            makeToolUse('tool-4', 'Bash', { command: 'git status --short' })
        ].join('\n'));

        expect(render(transcriptPath)).toBe('Tools: ◐ Edit: .../authentication.ts | ◐ Bash: git status --short | ✓ Read ×2');
        expect(render(transcriptPath, true)).toBe('◐ Edit: .../authentication.ts | ◐ Bash: git status --short | ✓ Read ×2');
    });

    it('includes error tool results in the summary counts', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-tools-widget-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tools-error.jsonl');
        fs.writeFileSync(transcriptPath, [
            makeToolUse('tool-1', 'Bash', { command: 'exit 1' }),
            makeToolResult('tool-1', true),
            makeToolUse('tool-2', 'Read', { file_path: '/tmp/example.txt' }),
            makeToolResult('tool-2')
        ].join('\n'));

        expect(render(transcriptPath)).toBe('Tools: ✓ Bash ×1 | ✓ Read ×1');
    });

    it('limits summary entries to the top four tools', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-tools-widget-'));
        tempRoots.push(root);
        const transcriptPath = path.join(root, 'tools-summary.jsonl');
        fs.writeFileSync(transcriptPath, [
            makeToolUse('tool-1', 'Read', { file_path: '/tmp/a' }),
            makeToolResult('tool-1'),
            makeToolUse('tool-2', 'Edit', { file_path: '/tmp/b' }),
            makeToolResult('tool-2'),
            makeToolUse('tool-3', 'Write', { file_path: '/tmp/c' }),
            makeToolResult('tool-3'),
            makeToolUse('tool-4', 'Glob', { pattern: '**/*.ts' }),
            makeToolResult('tool-4'),
            makeToolUse('tool-5', 'Grep', { pattern: 'TODO' }),
            makeToolResult('tool-5')
        ].join('\n'));

        expect(render(transcriptPath)).toBe('Tools: ✓ Read ×1 | ✓ Edit ×1 | ✓ Write ×1 | ✓ Glob ×1');
    });
});