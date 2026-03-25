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

import type { RenderContext } from '../../types/RenderContext';

// Mock homedir for task file reads
vi.mock('os', async () => {
    const actual = await vi.importActual('os');
    return {
        ...actual,
        homedir: () => join(tmpdir(), 'ccstatusline-test-home')
    };
});

// Mock git commands
vi.mock('../git', () => ({
    runGit: (cmd: string) => {
        if (cmd === 'branch --show-current') return 'main';
        if (cmd === 'rev-parse --show-toplevel') return '/Users/test/my-repo';
        return null;
    }
}));

// Import after mocks
const { resolveTerminalTitle } = await import('../terminal-title');

function taskDir(): string {
    return join(tmpdir(), 'ccstatusline-test-home', '.cache', 'ccstatusline', 'tasks');
}

function writeTask(sessionId: string, data: Record<string, string>): void {
    const dir = taskDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `claude-task-${sessionId}`), JSON.stringify(data), 'utf8');
}

const baseContext: RenderContext = {
    data: {
        session_id: 'test-session',
        model: { display_name: 'Opus 4.6' },
        workspace: { current_dir: '/Users/test/my-repo' }
    }
};

describe('resolveTerminalTitle', () => {
    beforeEach(() => {
        mkdirSync(taskDir(), { recursive: true });
    });

    afterEach(() => {
        try { rmSync(taskDir(), { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('resolves repo and branch', () => {
        const result = resolveTerminalTitle('{repo}/{branch}', baseContext);
        expect(result).toBe('my-repo/main');
    });

    it('resolves model', () => {
        const result = resolveTerminalTitle('{model}', baseContext);
        expect(result).toBe('Opus 4.6');
    });

    it('resolves dir', () => {
        const result = resolveTerminalTitle('{dir}', baseContext);
        expect(result).toBe('my-repo');
    });

    it('resolves task from file', () => {
        writeTask('test-session', { task: 'Fix auth bug' });
        const result = resolveTerminalTitle('{task}', baseContext);
        expect(result).toBe('Fix auth bug');
    });

    it('drops empty segments', () => {
        // No task file exists, so {task} is empty
        const result = resolveTerminalTitle('{task} | {repo}/{branch}', baseContext);
        expect(result).toBe('my-repo/main');
    });

    it('keeps both segments when task exists', () => {
        writeTask('test-session', { task: 'Build API' });
        const result = resolveTerminalTitle('{task} | {repo}/{branch}', baseContext);
        expect(result).toBe('Build API | my-repo/main');
    });

    it('returns null when all segments are empty', () => {
        const emptyContext: RenderContext = { data: {} };
        const result = resolveTerminalTitle('{task}', emptyContext);
        expect(result).toBeNull();
    });

    it('handles string model format', () => {
        const ctx: RenderContext = {
            data: { model: 'Claude Haiku' }
        };
        const result = resolveTerminalTitle('{model}', ctx);
        expect(result).toBe('Claude Haiku');
    });
});
