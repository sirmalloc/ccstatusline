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
import { clearGitCache } from '../../utils/git';
import { GitChangesWidget } from '../GitChanges';

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
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('1 file changed, 2 insertions(+), 1 deletion(-)');
        mockExecFileSync.mockReturnValueOnce('1 file changed, 3 insertions(+), 4 deletions(-)');

        expect(render({ cwd: '/tmp/worktree' })).toBe('(+5,-5)');
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecFileSync.mock.calls[2]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
    });

    it('should render zero counts when repo is clean', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('(+0,-0)');
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
});
