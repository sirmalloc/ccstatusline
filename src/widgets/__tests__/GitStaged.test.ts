import { execSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { WidgetItem } from '../../types/Widget';
import { clearGitCache } from '../../utils/git';
import { GitStagedWidget } from '../GitStaged';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

describe('GitStagedWidget', () => {
    const widget = new GitStagedWidget();
    const item: WidgetItem = { id: 'staged', type: 'git-staged' };

    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    describe('getValueType', () => {
        it('returns boolean', () => {
            expect(widget.getValueType()).toBe('boolean');
        });
    });

    describe('getValue', () => {
        it('returns true when there are staged changes', () => {
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('M  file.ts\n');
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            expect(widget.getValue(context, item)).toBe(true);
        });

        it('returns false when there are no staged changes', () => {
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('');
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };

            expect(widget.getValue(context, item)).toBe(false);
        });

        it('returns null when not in a git repo', () => {
            mockExecSync.mockImplementation(() => { throw new Error('Not a git repo'); });
            const context: RenderContext = { data: { cwd: '/tmp/not-a-repo' } };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('returns true in preview mode', () => {
            const context: RenderContext = { isPreview: true };

            expect(widget.getValue(context, item)).toBe(true);
        });
    });
});