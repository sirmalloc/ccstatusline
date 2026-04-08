import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { TaskObjectiveWidget } from '../TaskObjective';

// Use a temp directory for tests instead of the real cache
const TEST_DIR = join(tmpdir(), 'ccstatusline-test-tasks');

// Mock homedir to redirect task files to temp dir
vi.mock('os', async () => {
    const actual = await vi.importActual('os');
    return {
        ...actual,
        homedir: () => join(tmpdir(), 'ccstatusline-test-home')
    };
});

const widget = new TaskObjectiveWidget();

function makeContext(sessionId?: string): RenderContext {
    return {
        data: sessionId ? { session_id: sessionId } : undefined
    };
}

function makeItem(overrides?: Partial<WidgetItem>): WidgetItem {
    return {
        id: 'task',
        type: 'task-objective',
        rawValue: true,
        ...overrides
    };
}

function taskDir(): string {
    return join(tmpdir(), 'ccstatusline-test-home', '.cache', 'ccstatusline', 'tasks');
}

function writeTask(sessionId: string, data: Record<string, string>): void {
    const dir = taskDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `claude-task-${sessionId}`), JSON.stringify(data), 'utf8');
}

function writeSidecar(sessionId: string, data: Record<string, unknown>): void {
    const dir = taskDir();
    writeFileSync(join(dir, `claude-task-${sessionId}.started`), JSON.stringify(data), 'utf8');
}

describe('TaskObjectiveWidget', () => {
    beforeEach(() => {
        mkdirSync(taskDir(), { recursive: true });
    });

    afterEach(() => {
        try { rmSync(taskDir(), { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('returns null when no session_id', () => {
        const result = widget.render(makeItem(), makeContext(), DEFAULT_SETTINGS);
        expect(result).toBeNull();
    });

    it('returns null when no task file exists', () => {
        const result = widget.render(makeItem(), makeContext('no-such-session'), DEFAULT_SETTINGS);
        expect(result).toBeNull();
    });

    it('renders task text from JSON file', () => {
        writeTask('test-1', { task: 'Fix login bug', status: 'in_progress' });
        const result = widget.render(makeItem(), makeContext('test-1'), DEFAULT_SETTINGS);
        expect(result).toContain('Fix login bug');
    });

    it('shows in_progress indicator by default', () => {
        writeTask('test-2', { task: 'Build API' });
        const result = widget.render(makeItem(), makeContext('test-2'), DEFAULT_SETTINGS);
        expect(result).toContain('\u{1F504}'); // 🔄
    });

    it('shows complete indicator', () => {
        writeTask('test-3', { task: 'Done task', status: 'complete' });
        const result = widget.render(makeItem(), makeContext('test-3'), DEFAULT_SETTINGS);
        expect(result).toContain('\u2705'); // ✅
    });

    it('shows failed indicator', () => {
        writeTask('test-4', { task: 'Bad task', status: 'failed' });
        const result = widget.render(makeItem(), makeContext('test-4'), DEFAULT_SETTINGS);
        expect(result).toContain('\u274C'); // ❌
    });

    it('shows blocked indicator', () => {
        writeTask('test-5', { task: 'Waiting', status: 'blocked' });
        const result = widget.render(makeItem(), makeContext('test-5'), DEFAULT_SETTINGS);
        expect(result).toContain('\u{1F6D1}'); // 🛑
    });

    it('prefixes with Task: when rawValue is false', () => {
        writeTask('test-6', { task: 'My task', status: 'in_progress' });
        const result = widget.render(makeItem({ rawValue: false }), makeContext('test-6'), DEFAULT_SETTINGS);
        expect(result).toMatch(/^Task: /);
    });

    it('truncates with ellipsis when exceeding maxWidth', () => {
        writeTask('test-7', { task: 'A very long task description that exceeds the limit', status: 'in_progress' });
        const result = widget.render(makeItem({ maxWidth: 20 }), makeContext('test-7'), DEFAULT_SETTINGS);
        expect(result!.length).toBeLessThanOrEqual(20);
        expect(result).toContain('...');
    });

    it('shows elapsed time by default', () => {
        writeTask('test-8', { task: 'Timed task', status: 'in_progress' });
        const result = widget.render(makeItem(), makeContext('test-8'), DEFAULT_SETTINGS);
        // Should contain parenthesized time like (0s) or (1s)
        expect(result).toMatch(/\(\d+[smh]/);
    });

    it('hides elapsed time when showElapsed is false', () => {
        writeTask('test-9', { task: 'No timer', status: 'in_progress' });
        const result = widget.render(
            makeItem({ metadata: { showElapsed: 'false' } }),
            makeContext('test-9'),
            DEFAULT_SETTINGS
        );
        expect(result).not.toMatch(/\(\d+[smh]/);
    });

    it('freezes elapsed time on complete status', () => {
        writeTask('test-10', { task: 'Freeze test', status: 'in_progress' });
        // Create a sidecar with a known start time (10 minutes ago)
        const tenMinAgo = Date.now() - 10 * 60 * 1000;
        writeSidecar('test-10', { task: 'Freeze test', startedAt: tenMinAgo });

        // First render while in_progress — should show ~10m
        const result1 = widget.render(makeItem(), makeContext('test-10'), DEFAULT_SETTINGS);
        expect(result1).toContain('10m');

        // Update status to complete
        writeTask('test-10', { task: 'Freeze test', status: 'complete' });
        const result2 = widget.render(makeItem(), makeContext('test-10'), DEFAULT_SETTINGS);
        // Should still show ~10m, not reset to 0s
        expect(result2).toContain('10m');
    });

    it('shows preview text', () => {
        const result = widget.render(makeItem(), { isPreview: true }, DEFAULT_SETTINGS);
        expect(result).toContain('Implement auth flow');
        expect(result).toContain('\u{1F504}');
    });

    it('reads plain text fallback', () => {
        const dir = taskDir();
        writeFileSync(join(dir, 'claude-task-plain'), 'Just plain text\nsecond line', 'utf8');
        const result = widget.render(makeItem(), makeContext('plain'), DEFAULT_SETTINGS);
        expect(result).toContain('Just plain text');
        expect(result).not.toContain('second line');
    });

    describe('getEditorDisplay', () => {
        it('shows display name', () => {
            const display = widget.getEditorDisplay(makeItem());
            expect(display.displayText).toBe('Task Objective');
        });

        it('shows maxWidth modifier', () => {
            const display = widget.getEditorDisplay(makeItem({ maxWidth: 30 }));
            expect(display.modifierText).toBe('(max:30)');
        });
    });
});
