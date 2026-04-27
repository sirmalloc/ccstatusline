import { execFileSync } from 'child_process';
import {
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
import { clearGitCache } from '../../utils/git';
import { GitWorktreeWidget } from '../GitWorktree';

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
    rawValue?: boolean;
} = {}) {
    const widget = new GitWorktreeWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-worktree',
        type: 'git-worktree',
        rawValue: options.rawValue,
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context);
}

describe('GitWorktreeWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('𖠰 main');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('main');
    });

    it('should render with worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/.git/worktrees/some-worktree');

        expect(render({ cwd: '/tmp/worktree' })).toBe('𖠰 some-worktree');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('git');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['rev-parse', '--is-inside-work-tree']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('git');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['rev-parse', '--git-dir']);
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
    });

    it('should render with nested worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/.git/worktrees/some-dir/some-worktree');

        expect(render()).toBe('𖠰 some-dir/some-worktree');
    });

    it('should render with no worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('.git');

        expect(render()).toBe('𖠰 main');
    });

    it('should handle windows git-dir paths', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('C:\\repo\\.git\\worktrees\\some-worktree');

        expect(render()).toBe('𖠰 some-worktree');
    });

    it('should render with no git when probe returns false', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('𖠰 no git');
    });

    it('should render with no git', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('𖠰 no git');
    });

    it('should hide no git when configured', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should render with invalid git dir', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('𖠰 no git');
    });

    it('should render with bare repo worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/worktrees/some-worktree');

        expect(render()).toBe('𖠰 some-worktree');
    });

    it('should render with nested bare repo worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/worktrees/some-dir/some-worktree');

        expect(render()).toBe('𖠰 some-dir/some-worktree');
    });

    it('should handle windows bare repo git-dir paths', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('C:\\repo\\worktrees\\some-worktree');

        expect(render()).toBe('𖠰 some-worktree');
    });
});
