import { execFileSync } from 'child_process';
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
import { expectGitExecOptions } from '../../utils/__tests__/git-test-helpers';
import { clearGitCache } from '../../utils/git';
import { GitDeletionsWidget } from '../GitDeletions';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hide?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
} = {}) {
    const widget = new GitDeletionsWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-deletions',
        type: 'git-deletions',
        metadata: options.hide ? { hide: options.hide } : (options.hideNoGit ? { hide: 'no-git' } : undefined)
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitDeletionsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('-10');
    });

    it('should render combined staged and unstaged deletions', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('1 file changed, 2 insertions(+), 1 deletion(-)');
        mockExecFileSync.mockReturnValueOnce('1 file changed, 3 insertions(+), 4 deletions(-)');

        expect(render({ cwd: '/tmp/worktree' })).toBe('-5');
        expectGitExecOptions(mockExecFileSync.mock.calls[0]?.[2], '/tmp/worktree');
        expectGitExecOptions(mockExecFileSync.mock.calls[1]?.[2], '/tmp/worktree');
        expectGitExecOptions(mockExecFileSync.mock.calls[2]?.[2], '/tmp/worktree');
    });

    it('should render zero count when repo is clean', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('-0');
    });

    it('should hide zero deletions when the zero state is enabled', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ hide: 'zero' })).toBeNull();
    });

    it('should keep non-zero deletions visible with the zero state enabled', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('1 file changed, 2 insertions(+), 1 deletion(-)');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ hide: 'zero' })).toBe('-1');
    });

    it('should render no git when probe returns false', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('(no git)');
    });

    it('should hide no git when configured', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should render no git when command fails', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('(no git)');
    });

    it('should disable raw value support', () => {
        const widget = new GitDeletionsWidget();

        expect(widget.supportsRawValue()).toBe(false);
    });
});
