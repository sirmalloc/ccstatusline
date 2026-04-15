import { execSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { clearGitCache } from '../../utils/git';
import { GitChangesWidget } from '../GitChanges';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
} = {}) {
    const widget = new GitChangesWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-changes',
        type: 'git-changes',
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitChangesWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('(+42,-10)');
    });

    it('should render combined staged and unstaged changes', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('1 file changed, 2 insertions(+), 1 deletion(-)');
        mockExecSync.mockReturnValueOnce('1 file changed, 3 insertions(+), 4 deletions(-)');

        expect(render({ cwd: '/tmp/worktree' })).toBe('(+5,-5)');
        expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecSync.mock.calls[1]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecSync.mock.calls[2]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
    });

    it('should render zero counts when repo is clean', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');
        mockExecSync.mockReturnValueOnce('');

        expect(render()).toBe('(+0,-0)');
    });

    it('should render no git when probe returns false', () => {
        mockExecSync.mockReturnValue('false\n');

        expect(render()).toBe('(no git)');
    });

    it('should hide no git when configured', () => {
        mockExecSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should render no git when command fails', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('(no git)');
    });

    describe('getValueType', () => {
        it('returns boolean', () => {
            const widget = new GitChangesWidget();
            expect(widget.getValueType()).toBe('boolean');
        });
    });

    describe('getValue', () => {
        it('returns true when there are changes', () => {
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('1 file changed, 5 insertions(+), 3 deletions(-)');
            mockExecSync.mockReturnValueOnce('');

            const widget = new GitChangesWidget();
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };
            const item: WidgetItem = { id: 'changes', type: 'git-changes' };

            expect(widget.getValue(context, item)).toBe(true);
        });

        it('returns false when there are no changes', () => {
            mockExecSync.mockReturnValueOnce('true\n');
            mockExecSync.mockReturnValueOnce('');
            mockExecSync.mockReturnValueOnce('');

            const widget = new GitChangesWidget();
            const context: RenderContext = { data: { cwd: '/tmp/repo' } };
            const item: WidgetItem = { id: 'changes', type: 'git-changes' };

            expect(widget.getValue(context, item)).toBe(false);
        });

        it('returns null when not in a git repo', () => {
            mockExecSync.mockImplementation(() => { throw new Error('Not a git repo'); });

            const widget = new GitChangesWidget();
            const context: RenderContext = { data: { cwd: '/tmp/not-a-repo' } };
            const item: WidgetItem = { id: 'changes', type: 'git-changes' };

            expect(widget.getValue(context, item)).toBe(null);
        });

        it('returns true in preview mode', () => {
            const widget = new GitChangesWidget();
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'changes', type: 'git-changes' };

            expect(widget.getValue(context, item)).toBe(true);
        });
    });
});